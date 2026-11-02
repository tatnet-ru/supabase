import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { DynamicForm } from '@/registry/default/platform/platform-kit-nextjs/components/dynamic-form'

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

const submit = async () => {
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

describe('DynamicForm with Zod 4', () => {
  it('renders wrapped field types and submits parsed defaults and transformations', async () => {
    const schema = z.object({
      name: z
        .string()
        .trim()
        .transform((value) => value.toUpperCase() + '!')
        .prefault(' demo '),
      count: z.coerce.number<number>().nonoptional().prefault(4),
      enabled: z.boolean().optional(),
      role: z.enum(['reader', 'writer']).optional(),
      tags: z.array(z.string()).nullable(),
      description: z.preprocess((value) => value, z.string()).prefault('details'),
    })
    const onSubmit = vi.fn()
    await act(async () => root.render(<DynamicForm schema={schema} onSubmit={onSubmit} />))
    expect(container.querySelector('input[name="name"]')).not.toBeNull()
    expect(container.querySelector('input[name="count"]')?.getAttribute('type')).toBe('number')
    expect(container.querySelector('[role="combobox"]')?.textContent).toContain('reader')
    await submit()
    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: 'DEMO!',
        count: 4,
        enabled: false,
        role: 'reader',
        tags: [],
        description: 'details',
      },
      expect.anything()
    )
  })

  it('normalizes database values while preserving schema validation', async () => {
    const schema = z.object({
      name: z.string().min(3),
      count: z.number().min(1),
      tags: z.array(z.string()),
      role: z.enum(['reader', 'writer']),
    })
    const onSubmit = vi.fn()
    await act(async () =>
      root.render(
        <DynamicForm
          schema={schema}
          onSubmit={onSubmit}
          initialValues={{ name: 'abc', count: 3, tags: '{a,b}', role: 'writer' }}
        />
      )
    )
    await submit()
    expect(onSubmit).toHaveBeenCalledWith(
      { name: 'abc', count: 3, tags: ['a', 'b'], role: 'writer' },
      expect.anything()
    )
    await act(async () =>
      root.render(
        <DynamicForm
          schema={schema}
          onSubmit={onSubmit}
          initialValues={{ name: 'x', count: 0, tags: [], role: 'reader' }}
        />
      )
    )
    await submit()
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Too small')
  })
})
