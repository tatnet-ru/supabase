import { safeSql } from '@supabase/pg-meta'
import { queryOptions, skipToken, useQuery } from '@tanstack/react-query'

import { databaseCronJobsKeys } from './keys'
import type { ConnectionVars } from '@/data/common.types'
import { executeSql } from '@/data/sql/execute-sql-mutation'
import { IS_PLATFORM } from '@/lib/constants'
import type { StudioError } from '@/lib/errors/studio-errors'
import { useGrant, type GrantFor } from '@/lib/grants'

export type TatnetCronVariables = ConnectionVars
export type TatnetCronError = StudioError
type TatnetCronGrant = GrantFor<'post', '/platform/pg-meta/{ref}/query'>

async function getTatnetCron(
  { projectRef, connectionString, grant }: TatnetCronVariables & { grant: TatnetCronGrant },
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('Project ref is required')

  // TatNet runs a compatible scheduler per project database. pg_cron itself
  // can only be installed in the shared cluster's configured database.
  const { result } = await executeSql<Array<{ is_tatnet_cron: boolean }>>(
    {
      projectRef,
      connectionString,
      sql: safeSql`
        SELECT
          to_regclass('cron.job') IS NOT NULL
          AND to_regclass('cron.job_run_details') IS NOT NULL
          AND to_regprocedure('cron.tatnet_valid_schedule(text)') IS NOT NULL
          AND to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL
          AND to_regprocedure('cron.unschedule(bigint)') IS NOT NULL
          AS is_tatnet_cron;
      `,
      queryKey: databaseCronJobsKeys.tatnet(projectRef),
      grant,
    },
    signal
  )

  return result[0]?.is_tatnet_cron === true
}

export type TatnetCronData = Awaited<ReturnType<typeof getTatnetCron>>

export const tatnetCronQueryOptions = ({
  projectRef,
  connectionString,
  grant,
}: TatnetCronVariables & { grant?: TatnetCronGrant }) =>
  queryOptions<TatnetCronData, TatnetCronError>({
    queryKey: databaseCronJobsKeys.tatnet(projectRef),
    queryFn: grant
      ? ({ signal }) => getTatnetCron({ projectRef, connectionString, grant }, signal)
      : skipToken,
    enabled: !IS_PLATFORM && typeof projectRef !== 'undefined',
  })

export const useTatnetCronQuery = (
  variables: TatnetCronVariables,
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const access = useGrant('POST /platform/pg-meta/{ref}/query', {
    projectRef: variables.projectRef,
  })
  return useQuery({
    ...tatnetCronQueryOptions({ ...variables, grant: access.grant }),
    enabled: enabled && !IS_PLATFORM && !!variables.projectRef && access.status === 'granted',
  })
}
