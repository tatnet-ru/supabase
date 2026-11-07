import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, type RenderOptions } from '@testing-library/react'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { useState } from 'react'
import { TooltipProvider } from 'ui'
import { CommandProvider } from 'ui-patterns/CommandMenu'

// End of third-party imports

import { ProfileContext, type ProfileContextType } from '@/lib/profile'

type AdapterProps = Partial<Parameters<typeof NuqsTestingAdapter>[0]>

export const CustomWrapper = ({
  children,
  queryClient,
  nuqs,
  profileContext,
}: {
  children: React.ReactNode
  queryClient?: QueryClient
  nuqs?: AdapterProps
  profileContext?: ProfileContextType
}) => {
  const [defaultQueryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })
  )
  const stableQueryClient = queryClient ?? defaultQueryClient

  const content = (
    <QueryClientProvider client={stableQueryClient}>
      <NuqsTestingAdapter {...nuqs}>
        <TooltipProvider>
          <CommandProvider openKey="">{children}</CommandProvider>
        </TooltipProvider>
      </NuqsTestingAdapter>
    </QueryClientProvider>
  )

  return profileContext ? (
    <ProfileContext.Provider value={profileContext}>{content}</ProfileContext.Provider>
  ) : (
    content
  )
}

type CustomRenderOpts = RenderOptions & {
  queryClient?: QueryClient
  nuqs?: AdapterProps
  profileContext?: ProfileContextType
}

export const customRender = (component: React.ReactElement, renderOptions?: CustomRenderOpts) => {
  return render(component, {
    wrapper: ({ children }) => (
      <CustomWrapper
        queryClient={renderOptions?.queryClient}
        nuqs={renderOptions?.nuqs}
        profileContext={renderOptions?.profileContext}
      >
        {children}
      </CustomWrapper>
    ),
    ...renderOptions,
  })
}

export const customRenderHook = <T,>(hook: () => T, renderOptions?: CustomRenderOpts) => {
  return renderHook(hook, {
    wrapper: ({ children }) => (
      <CustomWrapper
        queryClient={renderOptions?.queryClient}
        nuqs={renderOptions?.nuqs}
        profileContext={renderOptions?.profileContext}
      >
        {children}
      </CustomWrapper>
    ),
    ...renderOptions,
  })
}
