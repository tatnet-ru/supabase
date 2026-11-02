'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef } from 'react'
import { useForm, type DefaultValues, type FieldPath } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/registry/default/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/registry/default/components/ui/form'
import { Input } from '@/registry/default/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/registry/default/components/ui/select'
import { Switch } from '@/registry/default/components/ui/switch'

interface DynamicFormProps<T extends Record<string, z.ZodType> = Record<string, z.ZodType>> {
  schema: z.ZodObject<T>
  onSubmit: (data: z.infer<z.ZodObject<T>>) => void
  isLoading?: boolean
  initialValues?: Record<string, unknown>
  labels?: Record<string, string | { label: string; options?: Record<string, string> }>
  columnInfo?: Record<string, { data_type: string; is_nullable: boolean }>
}

const getZodDef = (schema: z.core.$ZodType) => (schema as z.core.$ZodTypes)._zod.def

const unwrapZodType = (fieldSchema: z.core.$ZodType): z.core.$ZodType => {
  const def = getZodDef(fieldSchema)
  switch (def.type) {
    case 'optional':
    case 'nonoptional':
    case 'default':
    case 'prefault':
    case 'nullable':
    case 'catch':
    case 'readonly':
      return unwrapZodType(def.innerType)
    case 'pipe':
      return unwrapZodType(getZodDef(def.in).type === 'transform' ? def.out : def.in)
    default:
      return fieldSchema
  }
}

// Keep defaults as raw form input: transformations run once, on submission.
const getDefault = (schema: z.core.$ZodType): { value: unknown } | undefined => {
  const def = getZodDef(schema)
  switch (def.type) {
    case 'default':
    case 'prefault':
      return { value: def.defaultValue }
    case 'optional':
    case 'nonoptional':
    case 'nullable':
    case 'catch':
    case 'readonly':
      return getDefault(def.innerType)
    case 'pipe':
      return getDefault(getZodDef(def.in).type === 'transform' ? def.out : def.in)
    default:
      return undefined
  }
}

const zDescription = (schema: z.core.$ZodType) => z.core.globalRegistry.get(schema)?.description

const enumValues = (schema: z.core.$ZodType) => {
  const def = getZodDef(schema)
  return def.type === 'enum'
    ? Object.values(def.entries).filter((value) => typeof value === 'string')
    : []
}

export function DynamicForm<T extends Record<string, z.ZodType> = Record<string, z.ZodType>>({
  schema,
  onSubmit,
  isLoading = false,
  initialValues,
  labels,
  columnInfo,
}: DynamicFormProps<T>) {
  const isInitializingRef = useRef(true)

  const defaultValues = Object.keys(schema.shape).reduce(
    (acc, key) => {
      const originalFieldSchema = schema.shape[key]
      if (typeof originalFieldSchema === 'undefined') {
        throw new Error(
          `Schema error: schema.shape['${key}'] is undefined. Check schema definition.`
        )
      }

      const fieldDefault = getDefault(originalFieldSchema)
      if (fieldDefault) {
        acc[key] = fieldDefault.value
        return acc
      }

      const baseType = unwrapZodType(originalFieldSchema)

      switch (getZodDef(baseType).type) {
        case 'string':
          acc[key] = ''
          break
        case 'boolean':
          acc[key] = false // Default optional booleans to false
          break
        case 'enum':
          // For enums, use the first enum value as default
          const options = enumValues(baseType)
          acc[key] = options[0] ?? ''
          break
        case 'number':
          acc[key] = 0 // Default optional numbers to 0
          break
        case 'array':
          acc[key] = [] // Default arrays to empty array
          break
        default:
          acc[key] = undefined // For other types, or if truly no default makes sense
          break
      }
      return acc
    },
    {} as Record<string, unknown>
  )

  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as DefaultValues<z.input<typeof schema>>,
  })

  useEffect(() => {
    if (initialValues) {
      isInitializingRef.current = true
      const schemaKeys = Object.keys(schema.shape)
      const processedInitialValues = schemaKeys.reduce(
        (acc, key) => {
          const fieldDefFromSchema = schema.shape[key]
          if (typeof fieldDefFromSchema === 'undefined') {
            throw new Error(`Schema error in useEffect: schema.shape['${key}'] is undefined.`)
          }
          const value = initialValues.hasOwnProperty(key) ? initialValues[key] : undefined
          const baseFieldType = unwrapZodType(fieldDefFromSchema)

          const fieldTypeName = getZodDef(baseFieldType).type
          if (fieldTypeName === 'boolean') {
            acc[key] = !!value
          } else if (fieldTypeName === 'string') {
            acc[key] = value === null || value === undefined ? '' : String(value)
          } else if (fieldTypeName === 'enum') {
            const options = enumValues(baseFieldType)
            acc[key] =
              value === null || value === undefined || !options.includes(String(value))
                ? options[0] || ''
                : String(value)
          } else if (fieldTypeName === 'number') {
            const num = Number(value)
            acc[key] = isNaN(num) ? 0 : num
          } else if (fieldTypeName === 'array') {
            // For arrays, the value should already be an array from the database
            // Handle null values properly
            if (Array.isArray(value)) {
              acc[key] = value
            } else if (value === null || value === undefined) {
              acc[key] = []
            } else if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
              // Parse PostgreSQL array format like {ONE,TWO} into JavaScript array
              try {
                const innerContent = value.slice(1, -1) // Remove { and }
                if (innerContent.trim() === '') {
                  acc[key] = []
                } else {
                  // Split by comma and trim whitespace
                  acc[key] = innerContent.split(',').map((item: string) => item.trim())
                }
              } catch {
                // If parsing fails, default to empty array
                acc[key] = []
              }
            } else {
              acc[key] = []
            }
          } else {
            acc[key] = value
          }
          return acc
        },
        {} as Record<string, unknown>
      )
      form.reset(processedInitialValues as z.input<typeof schema>)
      setTimeout(() => {
        isInitializingRef.current = false
      }, 0)
    } else {
      isInitializingRef.current = false
    }
  }, [initialValues, form, schema])

  const renderField = (fieldName: string, fieldSchema: z.core.$ZodType) => {
    const baseType = unwrapZodType(fieldSchema)
    const typeName = getZodDef(baseType).type
    const description = zDescription(fieldSchema)

    return (
      <FormField
        key={fieldName}
        control={form.control}
        name={fieldName as FieldPath<z.input<typeof schema>>}
        render={({ field }) => {
          const labelConfig = labels?.[fieldName]
          const label =
            typeof labelConfig === 'string' ? labelConfig : labelConfig?.label || fieldName
          const typeDisplay = columnInfo?.[fieldName]?.data_type || ''
          switch (typeName) {
            case 'string':
              return (
                <FormItem className="py-6 border-b">
                  <div className="w-full flex flex-col lg:flex-row lg:items-center justify-between w-full gap-4 lg:gap-8">
                    <div className="flex-1 pr-4">
                      <FormLabel>{label}</FormLabel>
                      <div className="text-sm text-muted-foreground mt-1">{typeDisplay}</div>
                      {description && <FormDescription>{description}</FormDescription>}
                      <FormMessage />
                    </div>
                    <div className="flex-1 lg:max-w-1/2">
                      <FormControl>
                        <Input
                          placeholder={`Enter your ${fieldName}`}
                          {...field}
                          value={String(field.value || '')}
                        />
                      </FormControl>
                    </div>
                  </div>
                </FormItem>
              )
            case 'number':
              return (
                <FormItem className="py-6 border-b">
                  <div className="w-full flex flex-col lg:flex-row lg:items-center justify-between w-full gap-4 lg:gap-8">
                    <div className="flex-1 pr-4">
                      <FormLabel>{label}</FormLabel>
                      <div className="text-sm text-muted-foreground">{typeDisplay}</div>
                      {description && <FormDescription>{description}</FormDescription>}
                      <FormMessage />
                    </div>
                    <div className="flex-1 lg:max-w-1/2">
                      <FormControl>
                        <Input
                          type="number"
                          placeholder={`Enter value for ${fieldName}`}
                          {...field}
                          value={String(field.value ?? '')}
                          onChange={(e) => {
                            const value = e.target.value
                            const num = parseInt(value, 10)
                            field.onChange(isNaN(num) ? undefined : num)
                          }}
                        />
                      </FormControl>
                    </div>
                  </div>
                </FormItem>
              )
            case 'boolean':
              return (
                <FormItem className="py-6 border-b flex flex-row items-center justify-between gap-8">
                  <div>
                    <FormLabel>{label}</FormLabel>
                    <div className="text-sm text-muted-foreground">{typeDisplay}</div>
                    {description && <FormDescription>{description}</FormDescription>}
                    <FormMessage />
                  </div>
                  <FormControl>
                    <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )
            case 'enum':
              const options = enumValues(baseType)
              const optionLabels = typeof labelConfig === 'object' ? labelConfig.options : undefined
              return (
                <FormItem className="py-6 border-b">
                  <div className="w-full flex flex-col lg:flex-row lg:items-center justify-between w-full gap-4 lg:gap-8">
                    <div className="flex-1 pr-4">
                      <FormLabel>{label}</FormLabel>
                      <div className="text-sm text-muted-foreground">{typeDisplay}</div>
                      {description && <FormDescription>{description}</FormDescription>}
                      <FormMessage />
                    </div>
                    <div className="flex-1 lg:max-w-1/2">
                      <Select
                        onValueChange={(value) => {
                          if (!isInitializingRef.current) {
                            field.onChange(value)
                          }
                        }}
                        value={String(field.value || '')}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={`Select a ${fieldName}`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {options.map((option: string) => (
                            <SelectItem key={option} value={option}>
                              {optionLabels?.[option] || option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </FormItem>
              )
            case 'array':
              return (
                <FormItem className="py-6 border-b">
                  <div className="flex flex-row items-center justify-between w-full gap-8">
                    <div className="flex-1 pr-4">
                      <FormLabel>{label}</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Enter as JSON array: [&quot;item1&quot;, &quot;item2&quot;]
                        {columnInfo?.[fieldName]?.is_nullable && ' (leave empty for null)'}
                      </div>

                      {description && <FormDescription>{description}</FormDescription>}
                      <FormMessage />
                    </div>
                    <div className="flex-1">
                      <FormControl>
                        <Input
                          placeholder={
                            columnInfo?.[fieldName]?.is_nullable
                              ? `[&quot;item1&quot;, &quot;item2&quot;] or leave empty for null`
                              : `[&quot;item1&quot;, &quot;item2&quot;]`
                          }
                          {...field}
                          value={
                            field.value === null || field.value === undefined
                              ? ''
                              : Array.isArray(field.value)
                                ? JSON.stringify(field.value)
                                : String(field.value || '')
                          }
                          onChange={(e) => {
                            const value = e.target.value
                            if (value.trim() === '') {
                              // Empty string means null (for nullable) or empty array (for non-nullable)
                              field.onChange(null)
                            } else {
                              try {
                                const parsed = JSON.parse(value)
                                if (Array.isArray(parsed)) {
                                  field.onChange(parsed)
                                } else {
                                  // If it's not an array, treat as invalid input
                                  field.onChange(value)
                                }
                              } catch {
                                // Invalid JSON, keep the string value to show error
                                field.onChange(value)
                              }
                            }
                          }}
                        />
                      </FormControl>
                    </div>
                  </div>
                </FormItem>
              )
            default:
              return <></>
          }
        }}
      />
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {Object.keys(schema.shape).map((fieldName) =>
          renderField(fieldName, schema.shape[fieldName])
        )}
        <div className="pt-6">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
