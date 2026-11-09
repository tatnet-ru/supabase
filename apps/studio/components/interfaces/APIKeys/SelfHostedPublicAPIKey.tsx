import { useParams } from 'common'
import { Card, CardContent, Input } from 'ui'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

import { getPublicAPIKey } from './SelfHostedPublicAPIKey.utils'
import { AlertError } from '@/components/ui/AlertError'
import CopyButton from '@/components/ui/CopyButton'
import type { APIKeysData } from '@/data/api-keys/api-keys-query'
import { useProjectSettingsV2Query } from '@/data/config/project-settings-v2-query'

export const SelfHostedPublicAPIKey = ({ apiKeys }: { apiKeys: APIKeysData }) => {
  const { ref: projectRef } = useParams()
  const { data: settings, isPending, isError, error } = useProjectSettingsV2Query({ projectRef })
  const endpoint = settings?.app_config?.endpoint
  const protocol = settings?.app_config?.protocol ?? 'https'
  const projectUrl = endpoint ? `${protocol}://${endpoint}` : undefined
  const publicKey = getPublicAPIKey(apiKeys)

  return (
    <Card>
      <CardContent className="space-y-3">
        {isPending && <GenericSkeletonLoader />}
        {isError && <AlertError error={error} subject="Failed to load project URL" />}
        {!isPending && !isError && projectUrl && (
          <div className="space-y-2">
            <label htmlFor="public-api-project-url" className="text-sm text-foreground">
              Project URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="public-api-project-url"
                readOnly
                value={projectUrl}
                className="font-mono"
              />
              <CopyButton text={projectUrl} variant="default" aria-label="Copy project URL">
                Copy URL
              </CopyButton>
            </div>
          </div>
        )}
        {!isPending && !isError && !projectUrl && (
          <p className="text-sm text-foreground-light">
            Project URL is unavailable. Ask your project administrator to check the Studio
            configuration.
          </p>
        )}
      </CardContent>
      <CardContent className="space-y-3">
        {publicKey && (
          <div className="space-y-2">
            <label htmlFor="public-api-key" className="text-sm text-foreground">
              {publicKey.label}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="public-api-key" readOnly value={publicKey.value} className="font-mono" />
              <CopyButton text={publicKey.value} variant="default" aria-label="Copy public API key">
                Copy key
              </CopyButton>
            </div>
            <p className="text-xs text-foreground-light">
              Use this public key in your browser application. Enable Row Level Security (RLS) and
              configure policies to control access to your data.
            </p>
          </div>
        )}
        {!publicKey && (
          <p className="text-sm text-foreground-light">
            No public API key is available. Ask your project administrator to check the Studio
            configuration.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
