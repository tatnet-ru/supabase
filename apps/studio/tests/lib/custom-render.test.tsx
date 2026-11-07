import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fireEvent, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { customRender } from './custom-render'

it('keeps cached queries connected to invalidation after rerender', async () => {
  let revision = 0
  const load = vi.fn(async () => `Revision ${++revision}`)
  function Fixture({ label }: { label: string }) {
    const client = useQueryClient()
    const { data } = useQuery({
      queryKey: ['provider-fixture'],
      queryFn: load,
      staleTime: Infinity,
    })
    return (
      <div>
        <span>{label}</span>
        <p>{data}</p>
        <button
          tabIndex={0}
          type="button"
          onClick={() => client.invalidateQueries({ queryKey: ['provider-fixture'] })}
        >
          Refresh
        </button>
      </div>
    )
  }
  const { rerender } = customRender(<Fixture label="First render" />)
  expect(await screen.findByText('Revision 1')).toBeInTheDocument()
  rerender(<Fixture label="Second render" />)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(await screen.findByText('Revision 2')).toBeInTheDocument()
  expect(load).toHaveBeenCalledTimes(2)
})
