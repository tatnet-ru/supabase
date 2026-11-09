// Build/SSR fixture only: exercise Next rendering without an external project.
import { createServer } from 'node:http'

const tables = {
  posts: [{ id: 1, title: 'Security build fixture', content: 'Fixture post' }],
  articles: [{ id: 1, title: 'Security build fixture', content: 'Fixture article' }],
  countries: [{ id: 1, name: 'Fixture country', capital: 'Fixture capital' }],
}

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  response.setHeader('Content-Type', 'application/json')
  if (request.method !== 'GET') {
    response.writeHead(405).end(JSON.stringify({ error: 'Read-only build fixture' }))
    return
  }
  if (url.pathname === '/__fixture_health') {
    response.end(JSON.stringify({ status: 'ok' }))
    return
  }
  const table = url.pathname.match(/^\/rest\/v1\/(posts|articles|countries)$/)?.[1]
  if (!table) {
    response.writeHead(404).end(JSON.stringify({ error: 'Unknown fixture route' }))
    return
  }
  const rows = tables[table].filter(
    (row) => !url.searchParams.has('id') || url.searchParams.get('id') === `eq.${row.id}`
  )
  response.setHeader('Content-Range', `0-${Math.max(0, rows.length - 1)}/${rows.length}`)
  const single = request.headers.accept?.includes('application/vnd.pgrst.object+json')
  response.end(JSON.stringify(single ? (rows[0] ?? null) : rows))
})

server.listen(Number(process.env.NEXT_EXAMPLE_FIXTURE_PORT ?? 54321), '127.0.0.1', () => {
  console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}` }))
})
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close())
