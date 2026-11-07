import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const result = spawnSync('pnpm', ['audit', '--json'], { encoding: 'utf8', timeout: 120000 })
if (result.error) throw result.error
assert.ok(result.status === 0 || result.status === 1, 'pnpm audit did not complete')
const audit = JSON.parse(result.stdout)
assert.ok(audit.advisories && audit.metadata && !audit.error, 'Invalid audit response')
// CNA rejection: https://github.com/CVEProject/cvelistV5/blob/main/cves/2026/93xxx/CVE-2026-93753.json
const actionable = Object.values(audit.advisories).filter(
  (item) => item.github_advisory_id !== 'GHSA-gcqx-w48m-w2h4'
)
assert.deepEqual(
  actionable.map(({ module_name, severity, url }) => ({ module_name, severity, url })),
  []
)
console.log('No actionable workspace advisories; only CNA-rejected CVE-2026-93753 is excluded')
