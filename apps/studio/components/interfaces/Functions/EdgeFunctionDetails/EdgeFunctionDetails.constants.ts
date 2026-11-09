interface InvocationTab {
  id: string
  label: string
  language: 'bash' | 'js' | 'ts' | 'dart' | 'python'
  hideLineNumbers?: boolean
  code: (props: {
    showKey: boolean
    functionUrl: string
    functionSlug: string
    apiKey: string
  }) => string
}

export const INVOCATION_TABS: InvocationTab[] = [
  {
    id: 'curl',
    label: 'cURL',
    language: 'bash',
    code: ({ showKey, functionUrl, apiKey }) => {
      const obfuscatedName = apiKey.includes('publishable')
        ? 'SUPABASE_PUBLISHABLE_KEY'
        : 'SUPABASE_ANON_KEY'
      const keyValue = showKey ? apiKey : obfuscatedName

      return `curl -L -X POST '${functionUrl}' \\
  -H 'Authorization: Bearer ${keyValue}' \\${apiKey.includes('publishable') ? `\n  -H 'apikey: ${keyValue}' \\` : ''}
  -H 'Content-Type: application/json' \\
  --data '{"name":"Functions"}'`
    },
  },
  {
    id: 'supabase-js',
    label: 'JavaScript',
    language: 'js',
    hideLineNumbers: true,
    code: ({ functionSlug }) => `import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
const { data, error } = await supabase.functions.invoke('${functionSlug}', {
  body: { name: 'Functions' },
})`,
  },
  {
    id: 'swift',
    label: 'Swift',
    language: 'ts',
    hideLineNumbers: true,
    code: ({ functionSlug }) => `struct Response: Decodable {
  // Expected response definition
}

let response: Response = try await supabase.functions
  .invoke(
    "${functionSlug}",
    options: FunctionInvokeOptions(
      body: ["name": "Functions"]
    )
  )`,
  },
  {
    id: 'flutter',
    label: 'Flutter',
    language: 'dart',
    hideLineNumbers: true,
    code: ({
      functionSlug,
    }) => `final res = await supabase.functions.invoke('${functionSlug}', body: {'name': 'Functions'});
final data = res.data;`,
  },
  {
    id: 'python',
    label: 'Python',
    language: 'python',
    hideLineNumbers: true,
    code: ({ functionSlug }) => `response = supabase.functions.invoke(
    "${functionSlug}",
    invoke_options={"body": {"name": "Functions"}}
)`,
  },
]

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const
