import { zodResolver } from '@hookform/resolvers/zod'
import type { FieldValues, Resolver } from 'react-hook-form'
import type { z } from 'zod'

/**
 * Preserve the contract of forms whose state already has the parsed shape.
 * Only schemas that accept their own output can narrow the resolver input.
 * Schemas that transform to a different shape need explicit input/output form types.
 */
export function formOutputResolver<TSchema extends z.ZodType<FieldValues, FieldValues>>(
  schema: TSchema & (z.output<TSchema> extends z.input<TSchema> ? unknown : never)
): Resolver<z.output<TSchema>, unknown, z.output<TSchema>>
export function formOutputResolver(
  schema: z.ZodType<FieldValues, FieldValues>
): Resolver<FieldValues, unknown, FieldValues> {
  const resolve = zodResolver(schema)
  return (values, context, options) => resolve(values, context, options)
}

/** Metadata-driven forms accept arbitrary raw fields; submission uses the parsed schema output. */
export function dynamicFormResolver<TSchema extends z.ZodType<FieldValues, FieldValues>>(
  schema: TSchema
): Resolver<FieldValues, unknown, z.output<TSchema>>
export function dynamicFormResolver(
  schema: z.ZodType<FieldValues, FieldValues>
): Resolver<FieldValues, unknown, FieldValues> {
  const resolve = zodResolver(schema)
  return (values, context, options) => resolve(values, context, options)
}
