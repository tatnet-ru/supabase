import { useParams } from 'common'
import { PropsWithChildren } from 'react'

import AuthLayout from './AuthLayout'
import { PageLayout } from '@/components/layouts/PageLayout/PageLayout'
import { UnknownInterface } from '@/components/ui/UnknownInterface'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'

export const AuthEmailsLayout = ({ children }: PropsWithChildren<{}>) => {
  const { ref } = useParams()

  const showEmails = useIsFeatureEnabled('authentication:emails')

  // TatNet fork: both tabs work in self-hosted. SmtpForm reads and writes the
  // same /platform/auth/{ref}/config the templates use, and the TatNet edge
  // intercepts it in front of Studio: supa-control stores the stack's own
  // sender and builds gotrue's SMTP env from it (per-stack SMTP, 2026-08-17).
  // The tab was hidden before that shipped; the page kept working, so the
  // only thing the gate did was hide a working page from the nav.
  const navItems = [
    {
      label: 'Templates',
      href: `/project/${ref}/auth/templates`,
    },
    {
      label: 'SMTP Settings',
      href: `/project/${ref}/auth/smtp`,
    },
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
