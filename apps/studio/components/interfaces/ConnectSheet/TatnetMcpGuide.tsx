import { Button } from 'ui'
import { Admonition } from 'ui-patterns/Admonition'
import { CodeBlock } from 'ui-patterns/CodeBlock'

const MCP_URL = 'https://mcp.tatnet.cloud/supabase/mcp'

export function TatnetMcpGuide() {
  return (
    <div className="space-y-6 p-8">
      <div className="space-y-2">
        <h3 className="text-base font-medium">Connect ChatGPT to TatNet Supabase</h3>
        <p className="text-sm text-foreground-light">
          Use the managed MCP endpoint. No SSH tunnel or API Gateway setup is required. Access is
          authorized through your TatNet account, separately from Studio.
        </p>
      </div>
      <CodeBlock value={MCP_URL} language="text" hideLineNumbers />
      <ol className="list-decimal space-y-3 pl-5 text-sm text-foreground-light">
        <li>In ChatGPT, open Plugins, select Add, then Add custom MCP server.</li>
        <li>
          Paste this server URL and select OAuth. ChatGPT discovers the settings and registers the
          client automatically.
        </li>
        <li>
          Sign in to TatNet, choose your account, and select this database. Allow read access or
          administrative SQL on the consent screen.
        </li>
      </ol>
      <Admonition
        type="warning"
        title="Choose database access explicitly"
        description="Read access includes data and schema available to the database owner. Administrative SQL can change schema, policies, and delete data. New databases do not receive access automatically."
      />
      <p className="text-sm text-foreground-light">
        The server exposes list_databases, query_database, and execute_sql. Read-only mode and
        database scope are enforced by TatNet, not by URL options. Do not share Studio passwords or
        service-role keys. Other remote MCP clients can use the same URL with OAuth.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href="https://chatgpt.com/plugins" target="_blank" rel="noopener noreferrer">
            Open ChatGPT plugins
          </a>
        </Button>
        <Button asChild type="default">
          <a href="https://min.tatnet.ru/api-keys" target="_blank" rel="noopener noreferrer">
            Manage or revoke access
          </a>
        </Button>
      </div>
    </div>
  )
}
