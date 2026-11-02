import * as z from 'zod'

import { WRAPPER_HANDLERS, WRAPPERS } from './Wrappers.constants'
import type { Table, WrapperMeta } from './Wrappers.types'
import { FDW, FDWTable } from '@/data/fdw/fdws-query'

const tableSchema = z
  .object({
    index: z.number(),
    columns: z.array(z.object({ name: z.string(), type: z.string() })),
    is_new_schema: z.boolean(),
    schema: z.string(),
    schema_name: z.string(),
    table_name: z.string(),
    object: z.any().optional(),
  })
  .passthrough() // passthrough is needed for table options

function withOptionSchemas<T extends z.ZodRawShape>(
  fields: T,
  options: { name: string; required: boolean }[]
): z.ZodObject<T, z.core.$loose>
function withOptionSchemas(fields: z.ZodRawShape, options: { name: string; required: boolean }[]) {
  const shape: Record<string, z.ZodType> = {}
  for (const option of options) {
    shape[option.name] = option.required ? z.string().min(1, 'Required') : z.string().optional()
  }
  return z.looseObject({ ...shape, ...fields })
}

function stripExtraFields<T extends Record<string, unknown>>(values: T, keys: string[]): T {
  const allowed = new Set(keys)
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) delete values[key]
  }
  return values
}

export const getWrapperCreationFormSchema = (wrapperMeta: WrapperMeta) => {
  const common = { server_name: z.string().min(1, 'Please provide a name for your server') }
  return z
    .discriminatedUnion('mode', [
      withOptionSchemas(
        {
          ...common,
          mode: z.literal('tables'),
          tables: z
            .array(tableSchema, {
              error: (issue) =>
                issue.input === undefined ? 'Please provide at least one table' : undefined,
            })
            .min(1, 'Please provide at least one table'),
        },
        wrapperMeta.server.options
      ),
      withOptionSchemas(
        {
          ...common,
          mode: z.literal('schema'),
          source_schema: z.string().min(1, 'Please provide a source schema'),
          target_schema: z.string().min(1, 'Please provide an unique target schema'),
        },
        wrapperMeta.server.options
      ),
    ])
    .transform((values) =>
      stripExtraFields(values, [
        'server_name',
        'mode',
        ...(values.mode === 'tables' ? ['tables'] : ['source_schema', 'target_schema']),
        ...wrapperMeta.server.options.map((option) => option.name),
      ])
    )
}

export const getEditionFormSchema = (wrapperMeta: WrapperMeta) =>
  withOptionSchemas(
    {
      server_name: z.string().min(1, 'Please provide a name for your server'),
      tables: z
        .array(tableSchema, {
          error: (issue) =>
            issue.input === undefined ? 'Please provide at least one table' : undefined,
        })
        .min(1, 'Please provide at least one table'),
    },
    wrapperMeta.server.options
  ).transform((values) =>
    stripExtraFields(values, [
      'server_name',
      'tables',
      ...wrapperMeta.server.options.map((option) => option.name),
    ])
  )

export const getTableFormSchema = (table: Table) =>
  withOptionSchemas(
    {
      table_name: z.string().min(1, 'Required'),
      schema: z.string().min(1, 'Required'),
      schema_name: z.string().optional(),
      columns: z.array(
        z.object({ name: z.string().min(1, 'Required'), type: z.string().min(1, 'Required') })
      ),
    },
    table.options
  ).superRefine((values, ctx) => {
    if (values.schema === 'custom' && !values.schema_name) {
      ctx.addIssue({ code: 'custom', path: ['schema_name'], message: 'Required' })
    }
  })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const makeValidateRequired = (options: { name: string; required: boolean }[]) => {
  const requiredOptionsSet = new Set(
    options.filter((option) => option.required).map((option) => option.name)
  )

  const requiredArrayOptionsSet = new Set(
    Array.from(requiredOptionsSet).filter((option) => option.includes('.'))
  )
  const requiredArrayOptions = Array.from(requiredArrayOptionsSet)

  return (values: Record<string, unknown>) => {
    const errors = Object.fromEntries(
      Object.entries(values)
        .flatMap(([key, value]): [string, unknown][] =>
          Array.isArray(value)
            ? [[key, value], ...value.map((v, i): [string, unknown] => [`${key}.${i}`, v])]
            : [[key, value]]
        )
        .filter(([_key, value]) => {
          const [key, idx] = _key.split('.')

          if (
            idx !== undefined &&
            requiredOptionsSet.has(key) &&
            isRecord(value) &&
            Object.keys(value).some((subKey) => requiredArrayOptionsSet.has(`${key}.${subKey}`))
          ) {
            const arrayOption = requiredArrayOptions.find((option) => option.startsWith(`${key}.`))
            if (arrayOption) {
              const subKey = arrayOption.split('.')[1]
              return !value[subKey]
            }

            return false
          }

          return requiredOptionsSet.has(key) && (Array.isArray(value) ? value.length < 1 : !value)
        })
        .map(([key]) => {
          if (key === 'table_name') return [key, 'Please provide a name for your table']
          else if (key === 'columns') return [key, 'Please select at least one column']
          else return [key, 'This field is required']
        })
    )

    return errors
  }
}

export const NewTable = {} as FormattedWrapperTable

export interface FormattedWrapperTable {
  index: number
  columns: { name: string }[]
  is_new_schema: boolean
  schema: string
  schema_name: string
  table_name: string
  object?: string // From options object for Firebase/Stripe
  [key: string]: unknown // For other dynamic options from table.options
}

export const formatWrapperTables = (
  wrapper: { handler: string; tables?: FDWTable[] },
  wrapperMeta?: WrapperMeta
): FormattedWrapperTable[] => {
  const tables = wrapper?.tables ?? []

  return tables.map((table) => {
    let index: number = 0
    const options = Object.fromEntries(table.options.map((option: string) => option.split('=')))

    switch (wrapper.handler) {
      case WRAPPER_HANDLERS.STRIPE:
        index =
          wrapperMeta?.tables.findIndex(
            (x) => x.options.find((x) => x.name === 'object')?.defaultValue === options.object
          ) ?? 0
        break
      case WRAPPER_HANDLERS.FIREBASE:
        if (options.object === 'auth/users') {
          index =
            wrapperMeta?.tables.findIndex((x) =>
              x.options.find((x) => x.defaultValue === 'auth/users')
            ) ?? 0
        } else {
          index = wrapperMeta?.tables.findIndex((x) => x.label === 'Firestore Collection') ?? 0
        }
        break
      case WRAPPER_HANDLERS.S3:
      case WRAPPER_HANDLERS.AIRTABLE:
      case WRAPPER_HANDLERS.LOGFLARE:
      case WRAPPER_HANDLERS.BIG_QUERY:
      case WRAPPER_HANDLERS.CLICK_HOUSE:
        break
    }

    return {
      ...options,
      index,
      id: table.id,
      columns: table.columns ?? [],
      is_new_schema: false,
      schema: table.schema,
      schema_name: table.schema,
      table_name: table.name,
    }
  })
}

export const convertKVStringArrayToJson = (values: string[]): Record<string, string> => {
  return Object.fromEntries(values.map((value) => value.split('=')))
}

export function wrapperMetaComparator(
  wrapperMeta: Pick<WrapperMeta, 'handlerName' | 'server'>,
  wrapper: FDW | undefined
) {
  if (wrapperMeta.handlerName === 'wasm_fdw_handler') {
    const serverOptions = convertKVStringArrayToJson(wrapper?.server_options ?? [])
    return (
      wrapperMeta.server.options.find((option) => option.name === 'fdw_package_name')
        ?.defaultValue === serverOptions['fdw_package_name']
    )
  }

  return wrapperMeta.handlerName === wrapper?.handler
}

export function getWrapperMetaForWrapper(wrapper: FDW | undefined) {
  return WRAPPERS.find((w) => wrapperMetaComparator(w, wrapper))
}

/**
 * Returns the subset of extensions that are required but not yet installed.
 * Returns `null` when the extensions list is still loading (undefined),
 * so callers can distinguish "loading" from "nothing to install".
 * Generic so the full extension type (including `default_version`) is preserved.
 */
export function getRequiredExtensionsToInstall<
  T extends { name: string; installed_version: string | null },
>(extensions: T[] | undefined, requiredExtensionNames: string[]): T[] | null {
  if (extensions === undefined) return null
  return extensions.filter(
    (ext) => requiredExtensionNames.includes(ext.name) && !ext.installed_version
  )
}

/**
 * Returns true when the wrappers extension is installed at >= 0.5.0,
 * which is the minimum version required for IMPORT FOREIGN SCHEMA support.
 */
export function hasForeignSchemaSupport(
  wrappersExtension: { installed_version: string | null } | undefined
): boolean {
  return wrappersExtension?.installed_version
    ? wrappersExtension.installed_version >= '0.5.0'
    : false
}
