import { IS_PLATFORM } from 'common'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

import { JWTSecretKeysTable } from '@/components/interfaces/JwtSecrets/jwt-secret-keys-table'
import { SelfHostedJWTSigningKeys } from '@/components/interfaces/JwtSecrets/SelfHostedJWTSigningKeys'
import { DefaultLayout } from '@/components/layouts/DefaultLayout'
import JWTKeysLayout from '@/components/layouts/JWTKeys/JWTKeysLayout'
import SettingsLayout from '@/components/layouts/ProjectSettingsLayout/SettingsLayout'
import { NoPermission } from '@/components/ui/NoPermission'
import { FGA_PERMISSIONS, useAsyncCheckPermissionsV2 } from '@/hooks/misc/useCheckPermissionsV2'
import type { NextPageWithLayout } from '@/types'

const JWTSigningKeysPage: NextPageWithLayout = () => {
  const { can: canReadAPIKeys, isSuccess: isPermissionsLoaded } = useAsyncCheckPermissionsV2(
    FGA_PERMISSIONS.PROJECT.AUTH_SIGNING_KEYS_READ
  )

  if (!isPermissionsLoaded) return <GenericSkeletonLoader />
  if (!canReadAPIKeys)
    return <NoPermission isFullPage resourceText="access your project's JWT signing keys" />
  if (!IS_PLATFORM) return <SelfHostedJWTSigningKeys />

  return <JWTSecretKeysTable />
}

JWTSigningKeysPage.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout title="JWT Keys">
      <JWTKeysLayout>{page}</JWTKeysLayout>
    </SettingsLayout>
  </DefaultLayout>
)

export default JWTSigningKeysPage
