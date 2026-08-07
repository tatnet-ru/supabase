import { useParams } from 'common'
import { PropsWithChildren } from 'react'

import AuthLayout from './AuthLayout'
import { PageLayout } from '@/components/layouts/PageLayout/PageLayout'
import { UnknownInterface } from '@/components/ui/UnknownInterface'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { IS_PLATFORM } from '@/lib/constants'

export const AuthEmailsLayout = ({ children }: PropsWithChildren<{}>) => {
  const { ref } = useParams()

  const showEmails = useIsFeatureEnabled('authentication:emails')

  // TatNet fork: self-hosted stacks send through the platform SMTP —
  // per-stack SMTP is not configurable, so only Templates is offered.
  const navItems = [
    {
      label: 'Templates',
      href: `/project/${ref}/auth/templates`,
    },
    ...(IS_PLATFORM
      ? [
          {
            label: 'SMTP Settings',
            href: `/project/${ref}/auth/smtp`,
          },
        ]
      : []),
  ]

  return (
    <AuthLayout title="Emails">
      {showEmails ? (
        <PageLayout
          title="Emails"
          subtitle="Configure what emails your users receive and how they are sent"
          navigationItems={navItems}
        >
          {children}
        </PageLayout>
      ) : (
        <UnknownInterface urlBack={`/project/${ref}/auth/users`} />
      )}
    </AuthLayout>
  )
}
