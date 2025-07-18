from typing import Optional

import dagster as dg
import pytest
from dagster._core.definitions.data_version import extract_data_version_from_entry
from dagster._core.definitions.definitions_class import Definitions
from dagster._core.definitions.events import AssetKey
from dagster._core.definitions.resource_definition import ResourceDefinition
from dagster._core.instance import DagsterInstance


def _get_current_data_version(key: AssetKey, instance: DagsterInstance) -> Optional[dg.DataVersion]:
    record = instance.get_latest_data_version_record(key)
    assert record is not None
    return extract_data_version_from_entry(record.event_log_entry)


def test_execute_source_asset_observation_job():
    executed = {}

    @dg.observable_source_asset
    def foo(_context) -> dg.DataVersion:
        executed["foo"] = True
        return dg.DataVersion("alpha")

    @dg.observable_source_asset
    def bar(context):
        executed["bar"] = True
        return dg.DataVersion("beta")

    instance = DagsterInstance.ephemeral()

    result = (
        dg.Definitions(
            assets=[foo, bar],
            jobs=[dg.define_asset_job("source_asset_job", [foo, bar])],
        )
        .resolve_job_def("source_asset_job")
        .execute_in_process(instance=instance)
    )

    assert result.success
    assert executed["foo"]
    assert _get_current_data_version(dg.AssetKey("foo"), instance) == dg.DataVersion("alpha")
    assert executed["bar"]
    assert _get_current_data_version(dg.AssetKey("bar"), instance) == dg.DataVersion("beta")


@pytest.mark.skip("Temporarily disabling this feature pending GQL UI work")
def test_partitioned_observable_source_asset():
    partitions_def_a = dg.StaticPartitionsDefinition(["A"])
    partitions_def_b = dg.StaticPartitionsDefinition(["B"])

    called = set()

    @dg.observable_source_asset(partitions_def=partitions_def_a)
    def foo(context):
        called.add("foo")
        return dg.DataVersion(context.partition_key)

    @dg.asset(partitions_def=partitions_def_a)
    def bar():
        called.add("bar")
        return 1

    @dg.asset(partitions_def=partitions_def_b)
    def baz():
        return 1

    with dg.instance_for_test() as instance:
        job_def = dg.Definitions(assets=[foo, bar, baz]).resolve_implicit_job_def_def_for_assets(
            [foo.key]
        )

        # If the asset selection contains any materializable assets, source assets observations will not run
        job_def.execute_in_process(partition_key="A", instance=instance)  # pyright: ignore[reportOptionalMemberAccess]
        assert called == {"bar"}

        # If the asset selection contains only observable source assets, source assets are observed
        job_def.execute_in_process(partition_key="A", asset_selection=[foo.key], instance=instance)  # pyright: ignore[reportOptionalMemberAccess]
        assert called == {"bar", "foo"}
        record = instance.get_latest_data_version_record(dg.AssetKey(["foo"]))
        assert record and extract_data_version_from_entry(record.event_log_entry) == dg.DataVersion(
            "A"
        )


@pytest.mark.parametrize(
    "is_valid,resource_defs",
    [(True, {"bar": ResourceDefinition.hardcoded_resource("bar")}), (False, {})],
)
def test_source_asset_observation_job_with_resource(is_valid, resource_defs):
    executed = {}

    @dg.observable_source_asset(
        required_resource_keys={"bar"},
    )
    def foo(context) -> dg.DataVersion:
        executed["foo"] = True
        return dg.DataVersion(f"{context.resources.bar}")

    instance = DagsterInstance.ephemeral()

    if is_valid:
        result = (
            dg.Definitions(
                assets=[foo],
                jobs=[dg.define_asset_job("source_asset_job", [foo])],
                resources=resource_defs,
            )
            .resolve_job_def("source_asset_job")
            .execute_in_process(instance=instance)
        )

        assert result.success
        assert executed["foo"]
        assert _get_current_data_version(dg.AssetKey("foo"), instance) == dg.DataVersion("bar")
    else:
        with pytest.raises(
            dg.DagsterInvalidDefinitionError,
            match="resource with key 'bar' required by op 'foo' was not provided",
        ):
            result = (
                dg.Definitions(
                    assets=[foo],
                    jobs=[dg.define_asset_job("source_asset_job", [foo])],
                    resources=resource_defs,
                )
                .resolve_job_def("source_asset_job")
                .execute_in_process(instance=instance)
            )


class Bar(dg.ConfigurableResource):
    data_version: str


@pytest.mark.parametrize(
    "is_valid,resource_defs",
    [(True, {"bar": Bar(data_version="bar")}), (False, {})],
)
def test_source_asset_observation_job_with_pythonic_resource(is_valid, resource_defs):
    executed = {}

    @dg.observable_source_asset
    def foo(bar: Bar) -> dg.DataVersion:
        executed["foo"] = True
        return dg.DataVersion(f"{bar.data_version}")

    instance = DagsterInstance.ephemeral()

    if is_valid:
        result = (
            dg.Definitions(
                assets=[foo],
                jobs=[dg.define_asset_job("source_asset_job", [foo])],
                resources=resource_defs,
            )
            .resolve_job_def("source_asset_job")
            .execute_in_process(instance=instance)
        )

        assert result.success
        assert executed["foo"]
        assert _get_current_data_version(dg.AssetKey("foo"), instance) == dg.DataVersion("bar")
    else:
        with pytest.raises(
            dg.DagsterInvalidDefinitionError,
            match="resource with key 'bar' required by op 'foo' was not provided",
        ):
            Definitions.validate_loadable(
                dg.Definitions(
                    assets=[foo],
                    jobs=[dg.define_asset_job("source_asset_job", [foo])],
                    resources=resource_defs,
                )
            )
