import { describe, expect, it, vi } from 'vitest'
import { recenterAmapToCampus } from './MapPage'

describe('campus map center', () => {
  it('recenters AMap on the CSUFT GCJ-02 coordinates', () => {
    const setZoomAndCenter = vi.fn()

    recenterAmapToCampus({ setZoomAndCenter })

    expect(setZoomAndCenter).toHaveBeenCalledWith(17, [112.994905, 28.131567])
  })
})
