import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'dist')
const siteUrl = 'https://saasatlas.vercel.app'
const manifest = JSON.parse(await readFile(path.join(root, 'data/catalog-import-2026-10-23.json'), 'utf8'))
const products = manifest.verified_candidates

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

function absoluteLogo(product) {
  return product.logo_path ? `${siteUrl}${product.logo_path}` : `${siteUrl}/favicon.svg`
}

function productPage(product) {
  const canonical = `${siteUrl}/products/${product.slug}/`
  const logo = absoluteLogo(product)
  const title = `${product.name} — ${product.category} | SaaslistAtlas`
  const description = product.description.replace(/\s+/g, ' ').trim()
  const metaDescription = description.length > 180 ? `${description.slice(0, 177).replace(/\s+\S*$/, '')}…` : description
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: product.name, item: canonical },
    ],
  }
  const webpage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url: canonical,
    description,
    isPartOf: { '@type': 'WebSite', name: 'SaaslistAtlas', url: `${siteUrl}/` },
    about: { '@type': 'Thing', name: product.name, description, url: product.canonical_url, image: logo },
    primaryImageOfPage: { '@type': 'ImageObject', url: logo },
  }
  const pricing = product.pricing_model ? `<p class="fact"><span>Pricing model</span><strong>${escapeHtml(product.pricing_model.replaceAll('-', ' '))}</strong>${product.pricing_url ? `<a href="${escapeHtml(product.pricing_url)}" rel="nofollow noopener" target="_blank">Check official pricing</a>` : ''}</p>` : ''
  const subcategory = product.subcategory ? `<p class="eyebrow">${escapeHtml(product.category)} <span>·</span> ${escapeHtml(product.subcategory)}</p>` : `<p class="eyebrow">${escapeHtml(product.category)}</p>`
  const verifiedDate = product.description_verified_at || product.logo_verified_at || product.verified_at
  const sourceDescription = product.description_source_url
    ? `Product information checked against the <a href="${escapeHtml(product.description_source_url)}" rel="nofollow noopener" target="_blank">official website</a>.`
    : `Product source: <a href="${escapeHtml(product.source_url)}" rel="nofollow noopener" target="_blank">${escapeHtml(product.source_provider)}</a>. ${escapeHtml(product.attribution_text)}.`
  const verification = verifiedDate ? `<p class="verified">Information last checked ${escapeHtml(new Date(verifiedDate).toISOString().slice(0, 10))}</p>` : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(metaDescription)}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/catalog-page.css">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="SaaslistAtlas">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(metaDescription)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${escapeHtml(logo)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(metaDescription)}">
  <meta name="twitter:image" content="${escapeHtml(logo)}">
  <script type="application/ld+json">${safeJson(breadcrumbs)}</script>
  <script type="application/ld+json">${safeJson(webpage)}</script>
</head>
<body>
  <header class="site-header"><a class="wordmark" href="/" aria-label="SaaslistAtlas home"><img src="/favicon.svg" alt="" width="30" height="30"><span>Saaslist<span class="atlas">Atlas</span></span></a><a class="back-link" href="/">Explore the directory <span aria-hidden="true">↗</span></a></header>
  <main>
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span>${escapeHtml(product.name)}</span></nav>
    <article class="product-profile">
      <div class="identity"><img class="product-logo" src="${escapeHtml(logo)}" alt="${escapeHtml(product.name)} logo" width="88" height="88"><div>${subcategory}<h1>${escapeHtml(product.name)}</h1><a class="official-link" href="${escapeHtml(product.canonical_url)}" target="_blank" rel="noopener">Visit official website <span aria-hidden="true">↗</span></a></div></div>
      <section class="description"><h2>About ${escapeHtml(product.name)}</h2><p>${escapeHtml(description)}</p></section>
      <section class="facts"><h2>Product details</h2><p class="fact"><span>Category</span><strong>${escapeHtml(product.category)}</strong></p>${product.subcategory ? `<p class="fact"><span>Product type</span><strong>${escapeHtml(product.subcategory)}</strong></p>` : ''}${pricing}<p class="fact"><span>Official website</span><a href="${escapeHtml(product.canonical_url)}" target="_blank" rel="noopener">${escapeHtml(new URL(product.canonical_url).hostname)}</a></p></section>
      <section class="source-note"><h2>Sources and verification</h2><p>${sourceDescription}</p>${verification}<p class="license">The sourced catalog data is attributed to ${escapeHtml(product.source_provider)} under CC BY 4.0. ${escapeHtml(product.attribution_text)}.</p></section>
      <a class="directory-cta" href="/">Discover more SaaS and AI products <span aria-hidden="true">→</span></a>
    </article>
  </main>
  <footer><a href="/">SaaslistAtlas</a><span>Independent product directory · Official links open in a new tab</span></footer>
</body>
</html>
`
}

await mkdir(output, { recursive: true })
await mkdir(path.join(output, 'products'), { recursive: true })
for (const product of products) {
  const directory = path.join(output, 'products', product.slug)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'index.html'), productPage(product))
}

const xml = products.map((product) => {
  const url = `${siteUrl}/products/${product.slug}/`
  const lastmod = product.description_verified_at || product.logo_verified_at || product.verified_at || manifest.official_metadata_checked_at
  return `  <url><loc>${url}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`
}).join('\n')
await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc></url>\n${xml}\n</urlset>\n`)
await writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`)
process.stdout.write(`Generated ${products.length} product pages, sitemap.xml, and robots.txt.\n`)
