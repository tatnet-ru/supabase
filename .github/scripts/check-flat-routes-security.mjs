import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const lite = resolve('apps/lite-studio')
const require = createRequire(join(lite, 'package.json'))
const cli = join(dirname(require.resolve('@react-router/dev/package.json')), 'bin.js')
const fixture = await mkdtemp(join(tmpdir(), 'codex-flat-routes-'))
try {
  await mkdir(join(fixture, 'app/routes/ignored'), { recursive: true })
  await symlink(join(lite, 'node_modules'), join(fixture, 'node_modules'), 'dir')
  await writeFile(
    join(fixture, 'package.json'),
    JSON.stringify({ name: 'flat-routes-fixture', private: true, type: 'module' })
  )
  await writeFile(join(fixture, 'app/root.tsx'), 'export default function Root() { return null }\n')
  for (const file of [
    '_index.tsx',
    'dashboard.tsx',
    '.secret.tsx',
    'dashboard.test.tsx',
    'ignored/route.tsx',
  ]) {
    await writeFile(
      join(fixture, 'app/routes', file),
      'export default function Route() { return null }\n'
    )
  }
  await writeFile(
    join(fixture, 'app/routes.ts'),
    `
import { flatRoutes } from '@react-router/fs-routes'
export default flatRoutes({ ignoredRouteFiles: ['**/*.test.tsx', '**/ignored'] })
`
  )
  const result = spawnSync(process.execPath, [cli, 'routes', '--json'], {
    cwd: fixture,
    encoding: 'utf8',
    timeout: 30000,
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
  const routes = JSON.parse(result.stdout)
  const files = []
  const visit = (items) => {
    for (const item of items) {
      files.push(item.file)
      if (item.children) visit(item.children)
    }
  }
  visit(routes)
  assert.deepEqual(files.sort(), ['root.tsx', 'routes/_index.tsx', 'routes/dashboard.tsx'])
  console.log(
    'Patched route discovery preserves index/dashboard routes and excludes hidden files, test files and ignored folders'
  )
} finally {
  await rm(fixture, { recursive: true, force: true })
}
