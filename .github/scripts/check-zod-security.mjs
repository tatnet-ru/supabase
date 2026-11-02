import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const root = createRequire(new URL('../../package.json', import.meta.url))
const docs = createRequire(new URL('../../apps/docs/package.json', import.meta.url))
const studio = createRequire(new URL('../../apps/studio/package.json', import.meta.url))
const aiCommands = createRequire(
  new URL('../../packages/ai-commands/package.json', import.meta.url)
)
const sdk = createRequire(aiCommands.resolve('ai'))
const provider = createRequire(sdk.resolve('@ai-sdk/provider-utils'))
const { z } = root('zod')
assert.equal(root('zod/package.json').version, '4.6.7')
for (const [name, make] of [
  ['max array', (element) => z.array(element).max(2)],
  ['exact array', (element) => z.array(element).length(2)],
  ['max set', (element) => z.set(element).max(2)],
  ['max map', (element) => z.map(z.string(), element).max(2)],
]) {
  let parsed = 0
  let refined = 0
  const schema = make(
    z.string().refine(() => {
      parsed++
      return true
    })
  ).refine(() => {
    refined++
    return true
  })
  const input = name.includes('set')
    ? new Set(['a', 'b', 'c'])
    : name.includes('map')
      ? new Map([
          ['a', 'a'],
          ['b', 'b'],
          ['c', 'c'],
        ])
      : ['a', 'b', 'c']
  const sync = schema.safeParse(input)
  const asyncResult = await schema.safeParseAsync(input)
  assert.equal(sync.success, false, name)
  assert.equal(asyncResult.success, false, name)
  assert.equal(sync.error.issues[0].code, 'too_big')
  assert.equal(parsed, 0, name + ' must reject before parsing any element')
  assert.equal(refined, 0, name + ' must not refine an oversized raw container')
}
const shape = z.object({ answer: z.string() })
const { zodResponseFormat } = docs('openai/helpers/zod')
const { default: OpenAI } = await import(docs.resolve('openai'))
let body
const client = new OpenAI({
  apiKey: 'fixture-key',
  fetch: async (_url, options) => {
    body = JSON.parse(options.body)
    return new Response(
      JSON.stringify({
        id: 'fixture',
        object: 'chat.completion',
        created: 0,
        model: 'fixture-model',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '{"answer":"fixture answer"}', refusal: null },
            finish_reason: 'stop',
            logprobs: null,
          },
        ],
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  },
})
const result = await client.chat.completions.parse({
  model: 'fixture-model',
  messages: [{ role: 'user', content: 'fixture' }],
  response_format: zodResponseFormat(shape, 'answer'),
})
assert.deepEqual(result.choices[0].message.parsed, { answer: 'fixture answer' })
assert.equal(body.response_format.json_schema.schema.properties.answer.type, 'string')
const { zodSchema } = provider('@ai-sdk/provider-utils')
const adapted = zodSchema(shape)
assert.equal(adapted.jsonSchema.properties.answer.type, 'string')
assert.equal((await adapted.validate({ answer: 'ok' })).success, true)
assert.equal((await adapted.validate({ answer: 123 })).success, false)
const { wrapOpenAI } = studio('braintrust')
const wrapped = wrapOpenAI(client)
const completion = await wrapped.chat.completions.create({
  model: 'fixture-model',
  messages: [{ role: 'user', content: 'fixture' }],
})
assert.equal(completion.choices[0].message.content, '{"answer":"fixture answer"}')
const { Levenshtein, ExactMatch } = await import(studio.resolve('autoevals'))
assert.equal((await Levenshtein({ output: 'fixture', expected: 'fixture' })).score, 1)
assert.equal((await ExactMatch({ output: 'fixture', expected: 'different' })).score, 0)
console.log(
  'Zod 4: sync/async collection size gates, OpenAI structured output, AI SDK schema validation Braintrust wrapper and autoevals scorers passed; all provider requests mocked'
)
