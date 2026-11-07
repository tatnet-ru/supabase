import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const examples = [
  'examples/user-management/nuxt3-user-management',
  'examples/user-management/sveltekit-user-management',
]
assert.ok(examples.includes(process.argv[2]), 'Select a supported framework example')
const result = spawnSync('npm', ['audit', '--json'], {
  cwd: resolve(process.argv[2]),
  encoding: 'utf8',
  timeout: 120000,
})
if (result.error) throw result.error
assert.ok(result.status === 0 || result.status === 1, 'npm audit did not complete')
const audit = JSON.parse(result.stdout)
assert.ok(audit.vulnerabilities && !audit.error, 'npm audit returned an error')
const advisories = Object.values(audit.vulnerabilities).flatMap((item) =>
  item.via.filter((via) => typeof via === 'object')
)
// CNA rejection: https://github.com/CVEProject/cvelistV5/blob/main/cves/2026/93xxx/CVE-2026-93753.json
const rejected = 'https://github.com/advisories/GHSA-gcqx-w48m-w2h4'
const actionable = advisories.filter((item) => item.url !== rejected)
assert.deepEqual(
  actionable.map(({ name, severity, url }) => ({ name, severity, url })),
  [],
  'Unexpected security advisories, including low severity'
)
console.log(
  `${process.argv[2]}: no actionable advisories; ${advisories.length - actionable.length} rejected CVE entries excluded`
)
