import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAutoSave } from './useAutoSave'

describe('useAutoSave', () => {
  it('keeps the original timer when only onSave callback identity changes', () => {
    vi.useFakeTimers()

    const firstSave = vi.fn()
    const secondSave = vi.fn()

    const { rerender } = renderHook(
      ({ onSave }) => useAutoSave({
        enabled: true,
        intervalSeconds: 1,
        activeKey: 'knowledge/demo',
        dirtyToken: 'knowledge/demo:v1',
        isSaving: false,
        onSave,
      }),
      {
        initialProps: {
          onSave: firstSave,
        },
      },
    )

    vi.advanceTimersByTime(500)

    rerender({ onSave: secondSave })

    vi.advanceTimersByTime(499)
    expect(firstSave).not.toHaveBeenCalled()
    expect(secondSave).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(firstSave).not.toHaveBeenCalled()
    expect(secondSave).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})
