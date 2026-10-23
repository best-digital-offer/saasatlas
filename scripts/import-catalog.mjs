import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chunk, normalizeOfficialUrl, canonicalDomain, mapPricingModel } from './catalog-import-core.mjs';

const manifestPath = process.argv[2] ?? 'data/catalog-import-2026-10-23.json';
const mode = process.argv[3] ?? 'verify';
const sourceProvider = 'Comparedge Open Data';
const ua = 'SaaslistAtlasCatalogImporter/1.0 (https://saasatlas.vercel.app)';

async function fetchVerified(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const finalUrl = response.url;
      const ok = response.status >= 200 && response.status < 400 && new URL(finalUrl).protocol === 'https:';
      await response.body?.cancel();
      if (ok) return { ok: true, status: response.status, final_url: finalUrl };
      return { ok: false, status: response.status, final_url: finalUrl, reason: `HTTP ${response.status}` };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  return { ok: false, reason: String(lastError?.name || 'NetworkError') };
}

async function verifyManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const candidates = manifest.candidates ?? [];
  const results = new Array(candidates.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= candidates.length) return;
      const candidate = candidates[index];
      const official = await fetchVerified(candidate.canonical_url);
      let pricing = { ok: false, reason: 'No official pricing URL supplied' };
      if (official.ok && candidate.pricing_url) pricing = await fetchVerified(candidate.pricing_url);
      const verifiedAt = new Date().toISOString();
      if (official.ok) {
        results[index] = {
          ...candidate,
          canonical_url: normalizeOfficialUrl(official.final_url),
          canonical_domain: canonicalDomain(official.final_url),
          verified_at: verifiedAt,
          pricing_url: pricing.ok ? normalizeOfficialUrl(pricing.final_url) : null,
          pricing_model: pricing.ok ? mapPricingModel(candidate.pricing_model) : null,
          pricing_verified_at: pricing.ok ? verifiedAt : null,
          official_site_verification: { status: official.status, checked_at: verifiedAt },
        };
      } else {
        results[index] = { rejected: true, source_id: candidate.source_id, name: candidate.name, official_url: candidate.canonical_url, reason: official.reason, status: official.status ?? null };
      }
    }
  }
  await Promise.all(Array.from({ length: 10 }, () => worker()));
  const allVerified = results.filter((row) => !row.rejected);
  const rejected = results.filter((row) => row.rejected);
  const targets = {
    'AI tools and AI software': 80, 'Marketing and sales SaaS': 50, 'Developer tools': 45,
    'Productivity and project management': 35, 'Design and content creation': 30,
    'Business and finance': 25, 'Customer support and e-commerce': 20, 'Security and infrastructure': 15,
  };
  const selected = [];
  const byCategory = {};
  for (const [category, target] of Object.entries(targets)) {
    const rows = allVerified.filter((row) => row.category === category);
    const chosen = rows.slice(0, target);
    selected.push(...chosen);
    byCategory[category] = chosen.length;
  }
  const selectedIds = new Set(selected.map((row) => row.source_id));
  const unselected = allVerified.filter((row) => !selectedIds.has(row.source_id));
  const shortfalls = Object.entries(targets).filter(([category, target]) => byCategory[category] < target);
  const output = { ...manifest, verified_at: new Date().toISOString(), verified_candidates: selected, rejected_candidates: rejected, verified_not_selected: unselected };
  await writeFile(manifestPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ candidate_count: candidates.length, verified_candidates: allVerified.length, selected_for_import: selected.length, rejected: rejected.length, not_selected: unselected.length, rejected_candidates: rejected, by_category: byCategory, shortfalls }, null, 2));
  if (shortfalls.length) process.exitCode = 2;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; keep it in a server-only environment variable`);
  return value;
}

async function importManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const candidates = manifest.verified_candidates ?? [];
  if (candidates.length === 0) throw new Error('No official-site-verified candidates are available. Run verify first.');
  if (candidates.some((row) => !row.verified_at || !row.official_site_verification?.status)) throw new Error('Every candidate must have a current official-site verification.');
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const stableContent = JSON.stringify(candidates.map(({ official_site_verification, ...row }) => row));
  const batchHash = createHash('sha256').update(stableContent).digest('hex');
  let lastError;
  for (const [index, batch] of chunk(candidates, 50).entries()) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { data, error } = await client.rpc('ingest_catalog_batch', {
        p_source_provider: sourceProvider,
        p_source_batch: batchHash,
        p_candidates: batch,
      });
      if (!error) {
        console.log(JSON.stringify({ batch: index + 1, batch_count: batch.length, result: data }));
        lastError = null;
        break;
      }
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
    if (lastError) throw new Error(`Batch ${index + 1} failed after retries: ${lastError.message}`);
  }
  const { data: runs, error: runError } = await client.from('catalog_import_runs').select('id').eq('source_provider', sourceProvider).eq('source_batch', batchHash).single();
  if (runError) throw new Error(`Could not load import run: ${runError.message}`);
  const { data: summary, error: finishError } = await client.rpc('finish_catalog_import', { p_run_id: runs.id });
  if (finishError) throw new Error(`Could not finalize import run: ${finishError.message}`);
  console.log(JSON.stringify({ run: summary, verified: candidates.length, rejected: manifest.rejected_candidates?.length ?? 0 }, null, 2));
}

if (mode === 'verify') await verifyManifest();
else if (mode === 'import') await importManifest();
else throw new Error('Use mode "verify" or "import"');
