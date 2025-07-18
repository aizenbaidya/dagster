import {Box, Colors, ConfigTypeSchema, Icon, Spinner} from '@dagster-io/ui-components';
import {Link} from 'react-router-dom';
import {AddToFavoritesButton} from 'shared/asset-graph/AddToFavoritesButton.oss';

import {AutomationConditionEvaluationLink} from './AssetNode2025';
import {GraphNode, displayNameForAssetKey, nodeDependsOnSelf, stepKeyForAsset} from './Utils';
import {gql, useQuery} from '../apollo-client';
import {SidebarAssetQuery, SidebarAssetQueryVariables} from './types/SidebarAssetInfo.types';
import {COMMON_COLLATOR} from '../app/Util';
import {useAssetAutomationData} from '../asset-data/AssetAutomationDataProvider';
import {useAssetLiveData} from '../asset-data/AssetLiveDataProvider';
import {ASSET_NODE_CONFIG_FRAGMENT} from '../assets/AssetConfig';
import {AssetDefinedInMultipleReposNotice} from '../assets/AssetDefinedInMultipleReposNotice';
import {
  ASSET_NODE_OP_METADATA_FRAGMENT,
  AssetMetadataTable,
  metadataForAssetNode,
} from '../assets/AssetMetadata';
import {AssetSidebarActivitySummary} from '../assets/AssetSidebarActivitySummary';
import {EvaluationUserLabel} from '../assets/AutoMaterializePolicyPage/EvaluationConditionalLabel';
import {DependsOnSelfBanner} from '../assets/DependsOnSelfBanner';
import {PartitionHealthSummary} from '../assets/PartitionHealthSummary';
import {UnderlyingOpsOrGraph} from '../assets/UnderlyingOpsOrGraph';
import {Version} from '../assets/Version';
import {
  EXECUTE_CHECKS_BUTTON_ASSET_NODE_FRAGMENT,
  EXECUTE_CHECKS_BUTTON_CHECK_FRAGMENT,
} from '../assets/asset-checks/ExecuteChecksButton';
import {assetDetailsPathForKey} from '../assets/assetDetailsPathForKey';
import {AttributeAndValue} from '../assets/overview/Common';
import {
  healthRefreshHintFromLiveData,
  usePartitionHealthData,
} from '../assets/usePartitionHealthData';
import {useRecentAssetEvents} from '../assets/useRecentAssetEvents';
import {DagsterTypeSummary} from '../dagstertype/DagsterType';
import {DagsterTypeFragment} from '../dagstertype/types/DagsterType.types';
import {AssetEventHistoryEventTypeSelector} from '../graphql/types';
import {METADATA_ENTRY_FRAGMENT} from '../metadata/MetadataEntryFragment';
import {TableSchemaAssetContext} from '../metadata/TableSchema';
import {ScheduleOrSensorTag} from '../nav/ScheduleOrSensorTag';
import {Description} from '../pipelines/Description';
import {SidebarSection, SidebarTitle} from '../pipelines/SidebarComponents';
import {ResourceContainer, ResourceHeader} from '../pipelines/SidebarOpHelpers';
import {pluginForMetadata} from '../plugins';
import {AnchorButton} from '../ui/AnchorButton';
import {WorkspaceAssetFragment} from '../workspace/WorkspaceContext/types/WorkspaceQueries.types';
import {buildRepoAddress} from '../workspace/buildRepoAddress';
import {RepoAddress} from '../workspace/types';
import {workspacePathFromAddress} from '../workspace/workspacePath';

export const SidebarAssetInfo = ({graphNode}: {graphNode: GraphNode}) => {
  const {assetKey, definition} = graphNode;
  const {liveData} = useAssetLiveData(assetKey, 'sidebar');
  const {liveData: liveAutomationData} = useAssetAutomationData(assetKey, 'sidebar');
  const partitionHealthRefreshHint = healthRefreshHintFromLiveData(liveData);
  const partitionHealthData = usePartitionHealthData(
    [assetKey],
    partitionHealthRefreshHint,
    'background',
  );
  const queryResult = useQuery<SidebarAssetQuery, SidebarAssetQueryVariables>(SIDEBAR_ASSET_QUERY, {
    variables: {assetKey: {path: assetKey.path}},
  });
  const {data} = queryResult;

  const {lastMaterialization} = liveData || {};
  const asset = data?.assetNodeOrError.__typename === 'AssetNode' ? data.assetNodeOrError : null;

  const recentEvents = useRecentAssetEvents(asset?.assetKey, 1, [
    definition.isObservable
      ? AssetEventHistoryEventTypeSelector.OBSERVATION
      : AssetEventHistoryEventTypeSelector.MATERIALIZATION,
  ]);

  if (!asset) {
    return (
      <>
        <Header assetNode={definition} repoAddress={null} />
        <Box padding={{vertical: 64}}>
          <Spinner purpose="section" />
        </Box>
      </>
    );
  }

  const repoAddress = buildRepoAddress(asset.repository.name, asset.repository.location.name);
  const {assetMetadata, assetType} = metadataForAssetNode(asset);
  const hasAssetMetadata = assetType || assetMetadata.length > 0;
  const assetConfigSchema = asset.configField?.configType;

  const OpMetadataPlugin = asset.op?.metadata && pluginForMetadata(asset.op.metadata);
  const hasAutomationCondition = !!liveAutomationData?.automationCondition;
  const sensors = liveAutomationData?.targetingInstigators.filter(
    (instigator) => instigator.__typename === 'Sensor',
  );
  const hasSensors = !!sensors?.length;
  const schedules = liveAutomationData?.targetingInstigators.filter(
    (instigator) => instigator.__typename === 'Schedule',
  );
  const hasSchedules = !!schedules?.length;

  return (
    <>
      <Header assetNode={definition} repoAddress={repoAddress} />

      <AssetDefinedInMultipleReposNotice
        assetKey={assetKey}
        loadedFromRepo={repoAddress}
        padded={false}
      />

      {(asset.description || OpMetadataPlugin?.SidebarComponent || !hasAssetMetadata) && (
        <SidebarSection title="Description">
          <Box padding={{vertical: 16, horizontal: 24}}>
            <Description description={asset.description || 'No description provided'} />
          </Box>
          {asset.op && OpMetadataPlugin?.SidebarComponent && (
            <Box padding={{bottom: 16, horizontal: 24}}>
              <OpMetadataPlugin.SidebarComponent definition={asset.op} repoAddress={repoAddress} />
            </Box>
          )}
        </SidebarSection>
      )}

      <AssetSidebarActivitySummary
        asset={asset}
        assetLastMaterializedAt={lastMaterialization?.timestamp}
        recentEvents={recentEvents}
        isObservable={definition.isObservable}
        stepKey={stepKeyForAsset(definition)}
        liveData={liveData}
      />

      <div style={{borderBottom: `2px solid ${Colors.borderDefault()}`}} />

      {nodeDependsOnSelf(graphNode) && (
        <Box padding={{vertical: 16, left: 24, right: 12}} border="bottom">
          <DependsOnSelfBanner />
        </Box>
      )}

      <SidebarSection title="Automation">
        <Box padding={{vertical: 16, horizontal: 24}} flex={{gap: 16, direction: 'column'}}>
          {hasSchedules ? (
            <AttributeAndValue label="Schedules">
              <ScheduleOrSensorTag
                repoAddress={repoAddress}
                schedules={schedules}
                showSwitch={false}
              />
            </AttributeAndValue>
          ) : null}
          {hasSensors ? (
            <AttributeAndValue label="Sensors">
              <ScheduleOrSensorTag repoAddress={repoAddress} sensors={sensors} showSwitch={false} />
            </AttributeAndValue>
          ) : null}
          {hasAutomationCondition ? (
            <AttributeAndValue label="Automation condition">
              <AutomationConditionEvaluationLink
                definition={definition}
                automationData={liveAutomationData}
              >
                <EvaluationUserLabel
                  userLabel={liveAutomationData.automationCondition!.label! || 'condition'}
                  expandedLabel={liveAutomationData.automationCondition!.expandedLabel}
                />
              </AutomationConditionEvaluationLink>
            </AttributeAndValue>
          ) : null}
        </Box>
      </SidebarSection>
      {asset.opVersion && (
        <SidebarSection title="Code Version">
          <Box padding={{vertical: 16, horizontal: 24}}>
            <Version>{asset.opVersion}</Version>
          </Box>
        </SidebarSection>
      )}

      {assetConfigSchema && (
        <SidebarSection title="Config">
          <Box padding={{vertical: 16, horizontal: 24}}>
            <ConfigTypeSchema
              type={assetConfigSchema}
              typesInScope={assetConfigSchema.recursiveConfigTypes}
            />
          </Box>
        </SidebarSection>
      )}

      {asset.requiredResources.length > 0 && (
        <SidebarSection title="Required resources">
          <Box padding={{vertical: 16, horizontal: 24}}>
            {[...asset.requiredResources]
              .sort((a, b) => COMMON_COLLATOR.compare(a.resourceKey, b.resourceKey))
              .map((resource) => (
                <ResourceContainer key={resource.resourceKey}>
                  <Icon name="resource" color={Colors.accentGray()} />
                  {repoAddress ? (
                    <Link
                      to={workspacePathFromAddress(
                        repoAddress,
                        `/resources/${resource.resourceKey}`,
                      )}
                    >
                      <ResourceHeader>{resource.resourceKey}</ResourceHeader>
                    </Link>
                  ) : (
                    <ResourceHeader>{resource.resourceKey}</ResourceHeader>
                  )}
                </ResourceContainer>
              ))}
          </Box>
        </SidebarSection>
      )}

      {assetMetadata.length > 0 && (
        <SidebarSection title="Metadata">
          <TableSchemaAssetContext.Provider
            value={{
              assetKey,
              materializationMetadataEntries: recentEvents.events[0]?.metadataEntries,
              definitionMetadataEntries: assetMetadata,
            }}
          >
            <AssetMetadataTable
              assetMetadata={assetMetadata}
              repoLocation={repoAddress?.location}
            />
          </TableSchemaAssetContext.Provider>
        </SidebarSection>
      )}

      {assetType && <TypeSidebarSection assetType={assetType} />}

      {asset.partitionDefinition && definition.isMaterializable && (
        <SidebarSection title="Partitions">
          <Box padding={{vertical: 16, horizontal: 24}} flex={{direction: 'column', gap: 16}}>
            <p>{asset.partitionDefinition.description}</p>
            <PartitionHealthSummary
              assetKey={asset.assetKey}
              partitionStats={liveData?.partitionStats}
              data={partitionHealthData}
            />
          </Box>
        </SidebarSection>
      )}
    </>
  );
};

const TypeSidebarSection = ({assetType}: {assetType: DagsterTypeFragment}) => {
  return (
    <SidebarSection title="Type">
      <DagsterTypeSummary type={assetType} />
    </SidebarSection>
  );
};

interface HeaderProps {
  assetNode: WorkspaceAssetFragment;
  opName?: string;
  repoAddress?: RepoAddress | null;
}

const Header = ({assetNode, repoAddress}: HeaderProps) => {
  const displayName = displayNameForAssetKey(assetNode.assetKey);

  return (
    <Box flex={{gap: 4, direction: 'column'}} margin={{left: 24, right: 12, vertical: 16}}>
      <SidebarTitle
        style={{
          marginBottom: 0,
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <Box>{displayName}</Box>
      </SidebarTitle>
      <Box flex={{direction: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
        <Box flex={{direction: 'row', gap: 4}}>
          <AnchorButton
            to={assetDetailsPathForKey(assetNode.assetKey)}
            icon={<Icon name="open_in_new" color={Colors.linkDefault()} />}
          >
            {'View in Asset Catalog '}
          </AnchorButton>
          <AddToFavoritesButton assetKey={assetNode.assetKey} />
        </Box>
        {repoAddress && (
          <UnderlyingOpsOrGraph assetNode={assetNode} repoAddress={repoAddress} minimal />
        )}
      </Box>
    </Box>
  );
};

const SIDEBAR_ASSET_FRAGMENT = gql`
  fragment SidebarAssetFragment on AssetNode {
    id
    description
    metadataEntries {
      ...MetadataEntryFragment
    }
    freshnessPolicy {
      maximumLagMinutes
      cronSchedule
      cronScheduleTimezone
    }
    internalFreshnessPolicy {
      ... on TimeWindowFreshnessPolicy {
        failWindowSeconds
        warnWindowSeconds
      }
    }
    backfillPolicy {
      description
    }
    pools
    partitionDefinition {
      description
    }
    assetKey {
      path
    }
    op {
      name
      description
      metadata {
        key
        value
      }
    }
    opVersion
    jobNames
    repository {
      id
      name
      location {
        id
        name
      }
    }
    requiredResources {
      resourceKey
    }
    assetChecksOrError {
      ... on AssetChecks {
        checks {
          name
          ...ExecuteChecksButtonCheckFragment
        }
      }
    }
    changedReasons

    ...AssetNodeConfigFragment
    ...AssetNodeOpMetadataFragment
    ...ExecuteChecksButtonAssetNodeFragment
  }

  ${ASSET_NODE_CONFIG_FRAGMENT}
  ${METADATA_ENTRY_FRAGMENT}
  ${ASSET_NODE_OP_METADATA_FRAGMENT}
  ${EXECUTE_CHECKS_BUTTON_ASSET_NODE_FRAGMENT}
  ${EXECUTE_CHECKS_BUTTON_CHECK_FRAGMENT}
`;

export const SIDEBAR_ASSET_QUERY = gql`
  query SidebarAssetQuery($assetKey: AssetKeyInput!) {
    assetNodeOrError(assetKey: $assetKey) {
      ... on AssetNode {
        id
        ...SidebarAssetFragment
      }
    }
  }

  ${SIDEBAR_ASSET_FRAGMENT}
`;
