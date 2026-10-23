import { describe, expect, it } from 'vitest'
import { minimumToOvertake, orderStandingBids, reservationChange, validateStandingBid } from './bidding'

const rules = { minimumInitialBid: 5, minimumIncrement: 5 }

describe('standing bid rules', () => {
  it('uses the configured opening bid when there is no competitor', () => {
    expect(minimumToOvertake(null, rules)).toBe(5)
  })

  it('requires the configured increment to take the lead', () => {
    expect(minimumToOvertake(100, rules)).toBe(105)
    expect(validateStandingBid(104, 0, 100, rules)).toContain('105')
    expect(validateStandingBid(105, 0, 100, rules)).toBeNull()
  })

  it('allows a lower bid without claiming it takes the lead', () => {
    expect(validateStandingBid(80, 0, 100, rules)).toBeNull()
  })

  it('reserves only an increase and releases only a decrease', () => {
    expect(reservationChange(100, 155)).toEqual({ reserve: 55, release: 0 })
    expect(reservationChange(155, 100)).toEqual({ reserve: 0, release: 55 })
  })

  it('orders equal amounts by accepted time, then stable product ID', () => {
    const ordered = orderStandingBids([
      { productId: 'b', amount: 40, acceptedAt: '2026-10-23T10:00:00.000Z' },
      { productId: 'c', amount: 40, acceptedAt: '2026-10-23T10:00:00.000Z' },
      { productId: 'a', amount: 40, acceptedAt: '2026-10-23T09:00:00.000Z' },
      { productId: 'd', amount: 50, acceptedAt: '2026-10-23T11:00:00.000Z' },
    ])
    expect(ordered.map((bid) => bid.productId)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('rejects fractional, unsafe, and below-minimum credit values', () => {
    expect(validateStandingBid(5.5, 0, null, rules)).toContain('whole number')
    expect(validateStandingBid(Number.MAX_SAFE_INTEGER + 1, 0, null, rules)).toContain('whole number')
    expect(validateStandingBid(4, 0, null, rules)).toContain('minimum')
  })
})
