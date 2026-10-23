export type CatalogComparable = {
  name: string
  slug: string
  canonical_url: string
  canonical_domain?: string
  source_provider?: string
  source_id?: string | null
}

export function normalizeOfficialUrl(input: string): string
export function canonicalDomain(input: string): string
export function slugify(value: string, fallback?: string): string
export function normalizeName(value: string): string
export function mapPricingModel(value: string | null | undefined): 'free' | 'freemium' | 'paid' | 'usage-based' | 'enterprise' | null
export function chunk<T>(items: T[], size?: number): T[][]
export function isExactDuplicate(candidate: CatalogComparable, existing: CatalogComparable): boolean
export function sharesDomain(candidate: Pick<CatalogComparable, 'canonical_domain'>, existingDomain: string): boolean
