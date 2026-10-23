import { describe, expect, it } from 'vitest'
import { canonicalDomain, chunk, isExactDuplicate, mapPricingModel, normalizeOfficialUrl, normalizeName, sharesDomain, slugify } from '../../scripts/catalog-import-core.mjs'

describe('catalog import normalization', () => {
  it('canonicalizes official HTTPS URLs without tracking parameters', () => {
    expect(normalizeOfficialUrl('https://WWW.Example.com/product/?utm_source=directory#pricing')).toBe('https://example.com/product')
    expect(() => normalizeOfficialUrl('http://example.com')).toThrow('must use HTTPS')
    expect(() => normalizeOfficialUrl('https://user:pass@example.com')).toThrow('cannot contain credentials')
  })

  it('normalizes registrable domains including common compound suffixes', () => {
    expect(canonicalDomain('https://www.product.example.com')).toBe('example.com')
    expect(canonicalDomain('https://service.example.co.uk')).toBe('example.co.uk')
  })

  it('produces safe stable slugs and names', () => {
    expect(slugify('Zoho Books')).toBe('zoho-books')
    expect(slugify('München & Co.')).toBe('munchen-and-co')
    expect(normalizeName('  Zoho—Books  ')).toBe('zoho books')
  })

  it('maps only known pricing models and batches no more than fifty rows', () => {
    expect(mapPricingModel('freemium')).toBe('freemium')
    expect(mapPricingModel('per-seat')).toBe('paid')
    expect(mapPricingModel('not-yet-verified')).toBeNull()
    expect(chunk(Array.from({ length: 101 }), 50).map((batch) => batch.length)).toEqual([50, 50, 1])
    expect(() => chunk([1], 51)).toThrow('between 1 and 50')
  })

  it('recognizes exact duplicates and routes shared domains for review', () => {
    const candidate = { name: 'Acme CRM', slug: 'acme-crm', canonical_url: 'https://acme.com/crm', canonical_domain: 'acme.com', source_provider: 'Example', source_id: 'acme-crm' }
    expect(isExactDuplicate(candidate, { name: 'ACME CRM', slug: 'other', canonical_url: 'https://other.test', source_provider: 'Other', source_id: 'other' })).toBe(true)
    expect(isExactDuplicate(candidate, { name: 'Different product', slug: 'other', canonical_url: 'https://other.test', source_provider: 'Example', source_id: 'acme-crm' })).toBe(true)
    expect(sharesDomain(candidate, 'sub.acme.com')).toBe(true)
    expect(sharesDomain(candidate, 'another.com')).toBe(false)
  })
})
