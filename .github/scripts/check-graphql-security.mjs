import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const docs = createRequire(resolve(root, 'apps/docs/package.json'))
const cli = createRequire(docs.resolve('@graphql-codegen/cli'))
const { codegen } = cli('@graphql-codegen/core')
const { buildSchema, graphql } = docs('graphql')
const schema = buildSchema(`
  scalar DateTime
  enum Status { OPEN DONE }
  interface Node { id: ID! }
  type Todo implements Node { id: ID!, task: String!, status: Status!, createdAt: DateTime }
  type Query { todo(id: ID!): Todo, nodes: [Node!]! }
  type Mutation { complete(id: ID!): Todo }
`)
const generated = await codegen({
  filename: 'graphql-security-fixture.ts',
  schema,
  documents: [],
  config: {},
  plugins: [{ typescript: {} }, { 'typescript-resolvers': {} }],
  pluginMap: {
    typescript: docs('@graphql-codegen/typescript'),
    'typescript-resolvers': docs('@graphql-codegen/typescript-resolvers'),
  },
})
const hash = createHash('sha256').update(generated).digest('hex')
assert.match(generated, /export type Todo =/)
assert.match(generated, /export type QueryResolvers/)
assert.match(generated, /export type MutationResolvers/)
console.log('GraphQL docs codegen fixture SHA256:', hash)
const temp = mkdtempSync(resolve(tmpdir(), 'graphql-security-'))
const previousCwd = process.cwd()
let cliHash
try {
  const schemaFile = resolve(temp, 'schema.graphql')
  const { printSchema } = docs('graphql')
  writeFileSync(schemaFile, printSchema(schema))
  process.chdir(resolve(root, 'apps/docs'))
  const outputs = await cli('@graphql-codegen/cli').generate(
    {
      schema: schemaFile,
      generates: {
        [resolve(temp, 'graphql.ts')]: { plugins: ['typescript', 'typescript-resolvers'] },
      },
    },
    false
  )
  assert.equal(outputs.length, 1)
  cliHash = createHash('sha256').update(outputs[0].content).digest('hex')
  console.log('GraphQL CLI fixture SHA256:', cliHash)
} finally {
  process.chdir(previousCwd)
  rmSync(temp, { recursive: true, force: true })
}
assert.equal(
  cliHash,
  '9fedd632d69076ead8fc96626134d83aa6b56f2cd566b4b6cc11f13ea64a9b53',
  'CLI schema loading and generation must preserve the baseline output'
)
assert.equal(
  hash,
  '5e5a8bc8d3127935c07055413ec836e4d7ab427b1d4ef0a4e25c7edf635a1680',
  'Docs code generation must preserve the baseline output'
)
const { mergeDeep } = cli('@graphql-tools/utils')
const payloadSchema = buildSchema(
  'type Payload { value: String, nested: Payload } type Query { left: Payload, right: Payload }'
)
const nested = { nested: { nested: { value: 'safe-value' } } }
const result = await graphql({
  schema: payloadSchema,
  source:
    '{left{constructor:nested{__proto__:nested{securityProbe:value}}} right{constructor:nested{__proto__:nested{securityProbe:value}}}}',
  rootValue: { left: nested, right: nested },
})
assert.equal(result.errors, undefined)
const originalCall = Function.prototype.call
const merged = mergeDeep([result.data.left, result.data.right])
assert.equal(Object.prototype.securityProbe, undefined)
assert.equal(Function.prototype.securityProbe, undefined)
assert.equal(Function.prototype.call, originalCall)
assert.equal(Object.hasOwn(merged, 'constructor'), false, 'Dangerous merge keys must be filtered')
assert.deepEqual(mergeDeep([{ todo: { id: '1' } }, { todo: { task: 'Fixture task' } }]), {
  todo: { id: '1', task: 'Fixture task' },
})
console.log('GraphQL aliased-result merge: prototype safety and normal result merging passed')
