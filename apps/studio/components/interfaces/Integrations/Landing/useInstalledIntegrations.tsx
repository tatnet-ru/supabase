import { PermissionAction } from '@supabase/shared-types/out/constants'
import { useMemo } from 'react'

import {
  hasMatchingWrapper,
  hasRequiredExtensions,
  isOAuthInstalled,
  isStripeSyncEngineInstalled,
  useProjectOAuthIntegrationData,
} from './Landing.utils'
import { useAvailableIntegrations } from './useAvailableIntegrations'
import { useTatnetCronQuery } from '@/data/database-cron-jobs/tatnet-cron-query'
import { useDatabaseExtensionsQuery } from '@/data/database-extensions/database-extensions-query'
import { useSchemasQuery } from '@/data/database/schemas-query'
import { useFDWsQuery } from '@/data/fdw/fdws-query'
import { useAsyncCheckPermissions } from '@/hooks/misc/useCheckPermissions'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import { IS_PLATFORM } from '@/lib/constants'
import { EMPTY_ARR } from '@/lib/void'

export const useInstalledIntegrations = () => {
  const { data: project } = useSelectedProjectQuery()
  const { data: org } = useSelectedOrganizationQuery()

  const { can: canReadOAuthApps } = useAsyncCheckPermissions(
    PermissionAction.READ,
    'oauth_apps',
    undefined,
    {
      organizationSlug: org?.slug,
      projectRef: null,
    }
  )

  const {
    data: allIntegrations = EMPTY_ARR,
    error: availableIntegrationsError,
    isPending: isAvailableIntegrationsLoading,
    isSuccess: isSuccessAvailableIntegrations,
    isError: isErrorAvailableIntegrations,
  } = useAvailableIntegrations()

  const hasOAuthIntegration = useMemo(() => {
    return allIntegrations.some((integration) => integration.type === 'oauth')
  }, [allIntegrations])

  const {
    data: oauthData,
    error: oauthDataError,
    isError: isErrorOAuthData,
    isLoading: isOAuthDataLoading,
    isSuccess: isSuccessOAuthData,
  } = useProjectOAuthIntegrationData(project?.ref, { enabled: hasOAuthIntegration })

  const {
    data: wrappers = EMPTY_ARR,
    error: fdwError,
    isError: isErrorFDWs,
    isPending: isFDWLoading,
    isSuccess: isSuccessFDWs,
  } = useFDWsQuery({
    projectRef: project?.ref,
    connectionString: project?.connectionString,
  })
  const {
    data: extensions = EMPTY_ARR,
    error: extensionsError,
    isError: isErrorExtensions,
    isPending: isExtensionsLoading,
    isSuccess: isSuccessExtensions,
  } = useDatabaseExtensionsQuery({
    projectRef: project?.ref,
    connectionString: project?.connectionString,
  })

  const {
    data: schemas = EMPTY_ARR,
    error: schemasError,
    isError: isErrorSchemas,
    isPending: isSchemasLoading,
    isSuccess: isSuccessSchemas,
  } = useSchemasQuery({
    projectRef: project?.ref,
    connectionString: project?.connectionString,
  })

  const isHooksEnabled =
    !!extensions.find((ext) => ext.name === 'pg_net')?.installed_version &&
    schemas.some((schema) => schema.name === 'supabase_functions')

  const shouldCheckTatnetCron =
    !IS_PLATFORM &&
    isSuccessExtensions &&
    isSuccessSchemas &&
    !extensions.some((ext) => ext.name === 'pg_cron' && !!ext.installed_version) &&
    schemas.some((schema) => schema.name === 'cron')

  const {
    data: isTatnetCron,
    error: tatnetCronError,
    isLoading: isTatnetCronLoading,
    isSuccess: isTatnetCronSuccess,
    isError: isTatnetCronError,
  } = useTatnetCronQuery(
    {
      projectRef: project?.ref,
      connectionString: project?.connectionString,
    },
    { enabled: shouldCheckTatnetCron }
  )

  const installedIntegrations = useMemo(() => {
    return allIntegrations
      .filter((integration) => {
        if (integration.id === 'cron' && shouldCheckTatnetCron && isTatnetCron) return true
        if (integration.id === 'webhooks') return isHooksEnabled
        if (integration.id === 'data_api') return true
        // Availability is already gated by the org allow-list in `useAvailableIntegrations`, and
        // whether Warehouse is set up on this project is handled inside its tabs, following the same split
        // Data API uses.
        if (integration.id === 'warehouse') return true
        if (integration.id === 'stripe_sync_engine') {
          return isStripeSyncEngineInstalled(schemas)
        }
        if (integration.type === 'wrapper') {
          return hasMatchingWrapper({ meta: integration.meta, wrappers })
        }
        if (integration.type === 'postgres_extension') {
          return hasRequiredExtensions({ integration, extensions })
        }
        if (integration.type === 'oauth') {
          return isOAuthInstalled({
            integration,
            projectData: oauthData,
          })
        }
        return false
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [
    allIntegrations,
    wrappers,
    extensions,
    schemas,
    isHooksEnabled,
    oauthData,
    shouldCheckTatnetCron,
    isTatnetCron,
  ])

  const error =
    fdwError ||
    extensionsError ||
    schemasError ||
    availableIntegrationsError ||
    (shouldCheckTatnetCron ? tatnetCronError : null) ||
    (canReadOAuthApps && hasOAuthIntegration ? oauthDataError : null)
  const isLoading =
    isSchemasLoading ||
    isFDWLoading ||
    isExtensionsLoading ||
    isAvailableIntegrationsLoading ||
    (shouldCheckTatnetCron && isTatnetCronLoading) ||
    (hasOAuthIntegration && canReadOAuthApps && isOAuthDataLoading)
  const isError =
    isErrorFDWs ||
    isErrorExtensions ||
    isErrorSchemas ||
    isErrorAvailableIntegrations ||
    (shouldCheckTatnetCron && isTatnetCronError) ||
    (hasOAuthIntegration && canReadOAuthApps && isErrorOAuthData)
  const isSuccess =
    isSuccessFDWs &&
    isSuccessExtensions &&
    isSuccessSchemas &&
    isSuccessAvailableIntegrations &&
    (!shouldCheckTatnetCron || isTatnetCronSuccess) &&
    (!hasOAuthIntegration || !canReadOAuthApps || isSuccessOAuthData)

  return {
    // show all integrations at once instead of showing partial results
    installedIntegrations: isLoading ? EMPTY_ARR : installedIntegrations,
    error,
    isError,
    isLoading,
    isSuccess,
  }
}
