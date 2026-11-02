import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import { dynamicFormResolver, formOutputResolver } from './form-output-resolver'

const options = { fields: {}, shouldUseNativeValidation: false, criteriaMode: 'all' as const }

describe('Zod form resolver boundaries', () => {
  it('preserves parsed defaults, coercion and removal of undeclared fields', async () => {
    const schema = z.object({
      port: z.coerce.number().int().min(1),
      enabled: z.boolean().nonoptional().prefault(false),
    })
    const resolve = dynamicFormResolver(schema)
    expect(await resolve({ port: '5432', ignored: 'fixture' }, undefined, options)).toEqual({
      errors: {},
      values: { port: 5432, enabled: false },
    })
    expect((await resolve({ port: '' }, undefined, options)).errors.port?.message).toBeDefined()
  })

  it('keeps the parsed-state contract without skipping validation', async () => {
    const schema = z.object({
      name: z.string().trim().min(1, 'Name is required'),
      tags: z.array(z.string()).optional().nonoptional().prefault([]),
    })
    const resolve = formOutputResolver(schema)
    expect(await resolve({ name: ' fixture ', tags: [] }, undefined, options)).toEqual({
      errors: {},
      values: { name: 'fixture', tags: [] },
    })
    const invalid = await resolve({ name: ' ', tags: [] }, undefined, options)
    expect(invalid.values).toEqual({})
    expect(invalid.errors.name?.message).toBe('Name is required')
  })

  it('keeps nested field paths and asynchronous refinements', async () => {
    const schema = z.object({
      account: z.object({
        name: z.string().refine(async (value) => value !== 'taken', 'Already used'),
      }),
    })
    const result = await dynamicFormResolver(schema)(
      { account: { name: 'taken' } },
      undefined,
      options
    )
    expect(result.errors).toMatchObject({ account: { name: { message: 'Already used' } } })
  })

  it('requires explicit input/output handling for incompatible transforms', () => {
    const schema = z.object({ count: z.string().transform(Number) })
    expectTypeOf<Parameters<typeof formOutputResolver<typeof schema>>[0]>().toBeNever()
  })
})
