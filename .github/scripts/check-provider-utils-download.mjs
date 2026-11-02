import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const workspaceRequire = createRequire(resolve('packages/ai-commands/package.json'))
const sdkRequire = createRequire(workspaceRequire.resolve('ai'))
const { fetchWithValidatedRedirects } = sdkRequire('@ai-sdk/provider-utils')

let privateRequests = 0
const server = createServer((_, response) => {
  privateRequests++
  response.end('private data')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
try {
  const url = new URL('http://127.0.0.1:' + server.address().port + '/')
  await assert.rejects(() => fetchWithValidatedRedirects({ url: url.href }))
  assert.equal(
    privateRequests,
    0,
    'The SDK must reject private destinations before sending a request'
  )
} finally {
  await new Promise((done) => server.close(done))
}

const publicResult = await fetchWithValidatedRedirects({
  url: 'https://registry.npmjs.org/undici/6.29.1',
  abortSignal: AbortSignal.timeout(20000),
})
assert.equal(publicResult.status, 200)
assert.equal((await publicResult.json()).version, '6.29.1')
console.log('SDK download accepts public HTTPS and rejects loopback before sending data')
