import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDomain, normalizeOfficialUrl, slugify, mapPricingModel } from './catalog-import-core.mjs';

const FEED_URL = 'https://comparedge.com/llms-tools.json';
const PROVIDER = 'Comparedge Open Data';
const ATTRIBUTION = 'Data from ComparEdge (CC BY 4.0)';
const sourceMap = new Map([
  ['AI tools and AI software', [
    ['Large Language Models', { exclude: ['Mistral Large', 'Command R+'] }], ['AI Writing Tools', 'Surfer SEO'], ['AI Coding Tools', 'v0 by Vercel'],
    ['AI Productivity', 'Notion AI'], ['AI Agents', null], ['AI Assistants', null],
    ['AI Video Tools', ['Kling AI', 'Pika', 'Runway', 'Synthesia']], ['AI Voice & Audio', null],
    ['AI Writing Tools', ['Surfer SEO']], ['AI Coding Tools', ['v0 by Vercel']], ['AI Productivity', ['Notion AI']],
  ]],
  ['Marketing and sales SaaS', [['CRM', null], ['Email Marketing', null], ['SEO Tools', null], ['Analytics & BI', null]]],
  ['Developer tools', [['Cloud Hosting', null], ['Databases', null], ['Vector Databases', null], ['FinOps & Cloud Cost', 4]]],
  ['Productivity and project management', [['Project Management', null], ['Video Conferencing', null], ['AI Meeting Tools', null]]],
  ['Design and content creation', [['Design Tools', ['Figma', 'Canva', 'Sketch', 'Penpot', 'Affinity Designer', 'Adobe Illustrator', 'Adobe Photoshop', 'Lunacy', 'Procreate', 'Pixlr', 'Spline', 'Whimsical', 'GIMP', 'CorelDRAW']], ['AI Image Generators', 'Canva AI'], ['AI Video Tools', null]]],
  ['Business and finance', [['Accounting', null], ['ERP Software', null], ['Payments & Billing', null]]],
  ['Customer support and e-commerce', [['Customer Support', null], ['Website Builders', ['WordPress.com', 'Wix', 'Squarespace', 'Webflow', 'Shopify', 'Weebly', 'Duda', '10Web', 'HubSpot CMS', 'ClickFunnels', 'Bubble', 'FlutterFlow', 'Glide', 'BuildShip']], ['Website Builders', null]]],
  ['Security and infrastructure', [['Password Managers', null], ['VPN', null], ['Cloud Security (CNAPP/CSPM)', 5], ['Identity & Access Management', 5]]],
]);
const categoryOrder = new Map([...sourceMap.keys()].map((value, index) => [value, index]));

function selectCategory(tools, category, selector) {
  const matching = tools.filter((tool) => tool.categoryName === category)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.name.localeCompare(b.name));
  if (selector === null) return matching;
  if (typeof selector === 'number') return matching.slice(0, selector);
  if (typeof selector === 'string') return matching.filter((tool) => tool.name !== selector);
  if (selector && !Array.isArray(selector) && Array.isArray(selector.exclude)) return matching.filter((tool) => !selector.exclude.includes(tool.name));
  if (Array.isArray(selector)) return matching.filter((tool) => selector.includes(tool.name));
  throw new Error(`Unsupported selector for ${category}`);
}

function makeRecord(tool, category) {
  const canonicalUrl = normalizeOfficialUrl(tool.website);
  const sourceUrl = tool.url || `https://comparedge.com/tools/${encodeURIComponent(tool.slug)}`;
  const pricingUrl = tool.pricingUrl ? normalizeOfficialUrl(tool.pricingUrl) : null;
  return {
    name: tool.name,
    slug: slugify(tool.slug || tool.name),
    canonical_url: canonicalUrl,
    canonical_domain: canonicalDomain(canonicalUrl),
    description: String(tool.description ?? '').trim(),
    category,
    subcategory: tool.categoryName,
    pricing_model: pricingUrl ? mapPricingModel(tool.pricingModel) : null,
    pricing_url: pricingUrl,
    pricing_verified_at: null,
    source_provider: PROVIDER,
    source_url: normalizeOfficialUrl(sourceUrl),
    source_id: String(tool.slug),
    attribution_text: ATTRIBUTION,
    verified_at: null,
    source_verification_date: tool.verifiedAt ?? null,
  };
}

const response = await fetch(FEED_URL, { headers: { 'User-Agent': 'SaaslistAtlasCatalogImporter/1.0 (https://saasatlas.vercel.app)' }, signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error(`ComparEdge feed returned HTTP ${response.status}`);
const feed = await response.json();
if (!Array.isArray(feed.tools)) throw new Error('ComparEdge feed has no tools array');

const picked = [];
for (const [category, groups] of sourceMap) {
  for (const [sourceCategory, selector] of groups) {
    const products = selectCategory(feed.tools, sourceCategory, selector);
    picked.push(...products.map((tool) => makeRecord(tool, category)));
  }
}

const targetCounts = Object.fromEntries([...sourceMap.keys()].map((category) => [category, picked.filter((tool) => tool.category === category).length]));
const expectedCounts = {
  'AI tools and AI software': 80, 'Marketing and sales SaaS': 50, 'Developer tools': 45,
  'Productivity and project management': 35, 'Design and content creation': 30,
  'Business and finance': 25, 'Customer support and e-commerce': 20, 'Security and infrastructure': 15,
};
const records = [];
const dedupSkips = [];
const seenNames = new Set();
const seenUrls = new Set();
const seenSourceIds = new Set();
for (const item of picked) {
  const keys = [item.name.toLowerCase(), item.canonical_url, item.source_provider + ':' + item.source_id];
  if (keys.some((key) => seenNames.has(key) || seenUrls.has(key) || seenSourceIds.has(key))) { dedupSkips.push({ name: item.name, canonical_url: item.canonical_url, source_id: item.source_id }); continue; }
  seenNames.add(item.name.toLowerCase());
  seenUrls.add(item.canonical_url);
  seenSourceIds.add(item.source_provider + ':' + item.source_id);
  records.push(item);
}
const finalCounts = Object.fromEntries([...sourceMap.keys()].map((category) => [category, records.filter((tool) => tool.category === category).length]));
const underTarget = Object.entries(expectedCounts).filter(([category, target]) => finalCounts[category] < target);
if (underTarget.length) {
  throw new Error(`Candidate pool is below a category target. Counts: ${JSON.stringify({ targetCounts, finalCounts, underTarget, dedupSkips })}`);
}

const output = {
  source: FEED_URL,
  source_provider: PROVIDER,
  license: 'CC BY 4.0',
  attribution: ATTRIBUTION,
  prepared_at: new Date().toISOString(),
  expected_count: 300,
  candidates: records,
  verified_candidates: [],
  rejected_candidates: [],
};
const file = resolve('data/catalog-import-2026-10-23.json');
await mkdir(resolve('data'), { recursive: true });
await writeFile(file, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ file, source_count: feed.tools.length, candidate_count: records.length, counts: finalCounts }, null, 2));
