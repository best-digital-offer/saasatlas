const MULTI_PART_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'org.au', 'co.in', 'com.in', 'co.nz', 'com.br', 'com.sg', 'co.jp']);

export function normalizeOfficialUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Official URL is not a valid absolute URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Official URL must use HTTPS and cannot contain credentials');
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

export function canonicalDomain(input) {
  const host = new URL(normalizeOfficialUrl(input)).hostname.replace(/^www\./, '').toLowerCase();
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const suffix = labels.slice(-2).join('.');
  return MULTI_PART_SUFFIXES.has(suffix) ? labels.slice(-3).join('.') : suffix;
}

export function slugify(value, fallback = 'product') {
  const slug = String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || fallback;
}

export function normalizeName(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function mapPricingModel(value) {
  const model = String(value ?? '').toLowerCase().trim();
  if (['free', 'freemium', 'enterprise'].includes(model)) return model;
  if (model.includes('usage')) return 'usage-based';
  if (['flat', 'seat-based', 'tiered', 'paid', 'per-seat', 'subscription'].includes(model)) return 'paid';
  return null;
}

export function chunk(items, size = 50) {
  if (!Number.isInteger(size) || size < 1 || size > 50) throw new Error('Batch size must be between 1 and 50');
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export function isExactDuplicate(candidate, existing) {
  return (candidate.source_id && existing.source_provider === candidate.source_provider && existing.source_id === candidate.source_id)
    || existing.canonical_url === candidate.canonical_url
    || existing.slug === candidate.slug
    || normalizeName(existing.name) === normalizeName(candidate.name);
}

export function sharesDomain(candidate, existingDomain) {
  return candidate.canonical_domain === existingDomain
    || candidate.canonical_domain.endsWith(`.${existingDomain}`)
    || existingDomain.endsWith(`.${candidate.canonical_domain}`);
}
