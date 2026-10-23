import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(root, 'data/catalog-import-2026-10-23.json')
const logoDirectory = path.join(root, 'public/catalog-logos')
const timeoutMs = 9_000
const concurrency = 10
const maxImageBytes = 1_000_000

function decodeHtml(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return tag.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find(Boolean) ?? ''
}

function cleanText(value, limit = 1_500) {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/[\s\u200b]+/g, ' ').trim().slice(0, limit)
}

function pageMetadata(html) {
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => ({ tag, key: (attribute(tag, 'property') || attribute(tag, 'name')).toLowerCase(), content: attribute(tag, 'content') }))
  const description = meta.find(({ key, content }) => key === 'og:description' && content.trim())?.content
    || meta.find(({ key, content }) => key === 'description' && content.trim())?.content
    || meta.find(({ key, content }) => key === 'twitter:description' && content.trim())?.content
    || ''
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => ({
    rel: attribute(tag, 'rel').toLowerCase().split(/\s+/),
    href: decodeHtml(attribute(tag, 'href')),
    sizes: attribute(tag, 'sizes'),
    type: attribute(tag, 'type').toLowerCase(),
  })).filter((link) => link.href && !link.href.startsWith('data:'))
  const iconLinks = links.filter(({ rel, type, href }) => (
    (rel.includes('apple-touch-icon') || rel.includes('icon'))
    && !rel.includes('mask-icon')
    && !type.includes('manifest')
    && !href.toLowerCase().endsWith('.webmanifest')
  )).sort((a, b) => {
    const score = ({ rel, sizes, type }) => (rel.includes('apple-touch-icon') ? 100 : 0)
      + (sizes.match(/(\d+)x\1/) ? Number(sizes.match(/(\d+)x\1/)[1]) : 0)
      + (type.includes('png') ? 5 : 0)
    return score(b) - score(a)
  })
  return { description: cleanText(description), iconLinks }
}

function safeSvg(bytes) {
  let svg = bytes.toString('utf8')
  if (!/<svg\b/i.test(svg)) return null
  svg = svg.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|xlink:href)\s*=\s*("(?:https?:|\/\/|javascript:|data:)[^"]*"|'(?:https?:|\/\/|javascript:|data:)[^']*')/gi, '')
    .replace(/url\(\s*['"]?(?:https?:|\/\/|data:)[^)]+\)/gi, 'none')
  return Buffer.from(svg)
}

function imageExtension(contentType, url) {
  const mime = contentType.split(';')[0].trim().toLowerCase()
  const known = new Map([
    ['image/png', '.png'], ['image/jpeg', '.jpg'], ['image/webp', '.webp'],
    ['image/gif', '.gif'], ['image/x-icon', '.ico'], ['image/vnd.microsoft.icon', '.ico'],
    ['image/svg+xml', '.svg'],
  ])
  if (known.has(mime)) return known.get(mime)
  const ext = path.extname(new URL(url).pathname).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.svg'].includes(ext) ? ext : null
}

async function fetchWithTimeout(url) {
  return fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'SaaslistAtlas-Directory/1.0 (+https://saasatlas.vercel.app/)', accept: 'text/html,application/xhtml+xml' },
  })
}

async function downloadLogo(product, baseUrl, iconLinks) {
  const candidates = [...iconLinks.map(({ href }) => href), new URL('/favicon.ico', baseUrl).href]
  const seen = new Set()
  for (const candidate of candidates) {
    let url
    try { url = new URL(candidate, baseUrl) } catch { continue }
    if (!['http:', 'https:'].includes(url.protocol) || seen.has(url.href)) continue
    seen.add(url.href)
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'SaaslistAtlas-Directory/1.0 (+https://saasatlas.vercel.app/)', accept: 'image/*' } })
      if (!response.ok) continue
      const contentType = response.headers.get('content-type') ?? ''
      const extension = imageExtension(contentType, response.url || url.href)
      if (!extension || !contentType.toLowerCase().startsWith('image/')) continue
      const declaredLength = Number(response.headers.get('content-length') ?? 0)
      if (declaredLength > maxImageBytes) continue
      let bytes = Buffer.from(await response.arrayBuffer())
      if (!bytes.length || bytes.length > maxImageBytes) continue
      if (extension === '.svg') {
        bytes = safeSvg(bytes)
        if (!bytes) continue
      }
      const filename = `${product.slug}${extension === '.jpeg' ? '.jpg' : extension}`
      await writeFile(path.join(logoDirectory, filename), bytes)
      return { path: `/catalog-logos/${filename}`, sourceUrl: response.url || url.href }
    } catch {
      // A missing or blocked icon is represented by the UI's text mark fallback.
    }
  }
  return { path: null, sourceUrl: null }
}

async function enrich(product) {
  try {
    const response = await fetchWithTimeout(product.canonical_url)
    if (!response.ok) return { ...product, official_description: null, description_source_url: null, description_verified_at: null, logo_path: null, logo_source_url: null, logo_verified_at: null, enrichment_status: `homepage_http_${response.status}` }
    const html = await response.text()
    const { description, iconLinks } = pageMetadata(html)
    const logo = await downloadLogo(product, response.url || product.canonical_url, iconLinks)
    const checkedAt = new Date().toISOString()
    return {
      ...product,
      ...(description.length >= 35 ? { description } : {}),
      official_description: description.length >= 35 ? description : null,
      description_source_url: description.length >= 35 ? (response.url || product.canonical_url) : null,
      description_verified_at: description.length >= 35 ? checkedAt : null,
      logo_path: logo.path,
      logo_source_url: logo.sourceUrl,
      logo_verified_at: logo.path ? checkedAt : null,
      enrichment_status: description.length >= 35 && logo.path ? 'description_and_logo' : description.length >= 35 ? 'description_only' : logo.path ? 'logo_only' : 'no_official_metadata',
    }
  } catch (error) {
    return { ...product, official_description: null, description_source_url: null, description_verified_at: null, logo_path: null, logo_source_url: null, logo_verified_at: null, enrichment_status: error?.name === 'TimeoutError' ? 'homepage_timeout' : 'homepage_unavailable' }
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const committedManifest = JSON.parse(execFileSync('git', ['show', 'HEAD:data/catalog-import-2026-10-23.json'], { cwd: root, encoding: 'utf8' }))
const committedBySlug = new Map(committedManifest.verified_candidates.map((product) => [product.slug, product]))
await mkdir(logoDirectory, { recursive: true })
const source = manifest.verified_candidates
const enriched = new Array(source.length)
let cursor = 0
let completed = 0
async function worker() {
  while (true) {
    const index = cursor++
    if (index >= source.length) return
    const product = await enrich(source[index])
    const committed = committedBySlug.get(product.slug)
    enriched[index] = { ...product, source_description: committed?.source_description ?? committed?.description ?? product.source_description ?? product.description }
    completed += 1
    if (completed % 25 === 0 || completed === source.length) process.stdout.write(`Enriched ${completed}/${source.length}\n`)
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
manifest.verified_candidates = enriched
manifest.official_metadata_checked_at = new Date().toISOString()
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const summary = enriched.reduce((result, product) => {
  result[product.enrichment_status] = (result[product.enrichment_status] ?? 0) + 1
  return result
}, {})
process.stdout.write(`${JSON.stringify({ total: enriched.length, descriptions: enriched.filter((product) => product.official_description).length, logos: enriched.filter((product) => product.logo_path).length, summary }, null, 2)}\n`)
