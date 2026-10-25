import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Check, ChevronDown, ChevronRight,
  Compass, ExternalLink, Menu, Plus, Search, Sparkles,
  Trophy, X, LoaderCircle,
} from 'lucide-react'
import { supabase, supabaseConfigured } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import AuthDialog from './AuthDialog'
import FounderWorkspace from './FounderWorkspace'
import type { PublicLeaderboardRecord } from './lib/supabase'

type Product = {
  id: string
  name: string
  tagline: string
  category: string
  credits: number
  movement: number
  symbol: string
  tone: string
  website: string
  currentRank?: number | null
  firstBidAt?: string | null
  createdAt?: string | null
  isCatalog?: boolean
  sourceProvider?: string
  sourceUrl?: string
  attributionText?: string
  verifiedAt?: string
  pricingModel?: string | null
  pricingUrl?: string | null
  pricingVerifiedAt?: string | null
  logoUrl?: string | null
  descriptionSourceUrl?: string | null
  descriptionVerifiedAt?: string | null
  seoPath?: string
}

const sampleProducts: Product[] = [
  { id: 'northstar', name: 'Northstar', tagline: 'Make your next move clearer.', category: 'AI', credits: 248, movement: 2, symbol: '✦', tone: 'midnight', website: 'northstar.example' },
  { id: 'fieldnote', name: 'Fieldnote', tagline: 'One place for product thinking.', category: 'Productivity', credits: 192, movement: 0, symbol: 'F', tone: 'blue', website: 'fieldnote.example' },
  { id: 'orbitcode', name: 'Orbitcode', tagline: 'An IDE that keeps you in flow.', category: 'Developer tools', credits: 155, movement: -1, symbol: '◈', tone: 'ink', website: 'orbitcode.example' },
  { id: 'signalroom', name: 'Signalroom', tagline: 'Turn conversations into clarity.', category: 'Analytics', credits: 130, movement: 3, symbol: '›', tone: 'sky', website: 'signalroom.example' },
  { id: 'daylight', name: 'Daylight', tagline: 'A calmer way to plan your week.', category: 'Productivity', credits: 98, movement: -1, symbol: '◌', tone: 'coral', website: 'daylight.example' },
  { id: 'shipyard', name: 'Shipyard', tagline: 'Build, preview, and ship together.', category: 'Developer tools', credits: 80, movement: 0, symbol: '▲', tone: 'ink', website: 'shipyard.example' },
  { id: 'ledgerly', name: 'Ledgerly', tagline: 'Know where every dollar goes.', category: 'Finance', credits: 72, movement: 4, symbol: 'L', tone: 'mint', website: 'ledgerly.example' },
  { id: 'goodbrief', name: 'Goodbrief', tagline: 'Better briefs, fewer surprises.', category: 'Design', credits: 68, movement: 1, symbol: 'G', tone: 'lavender', website: 'goodbrief.example' },
  { id: 'relaydesk', name: 'Relaydesk', tagline: 'Support that feels human.', category: 'Marketing', credits: 64, movement: -2, symbol: 'R', tone: 'amber', website: 'relaydesk.example' },
  { id: 'atlasmail', name: 'Atlasmail', tagline: 'Email, without the busywork.', category: 'Marketing', credits: 60, movement: 0, symbol: 'A', tone: 'teal', website: 'atlasmail.example' },
  { id: 'patchwork', name: 'Patchwork', tagline: 'Research stitched into your workflow.', category: 'AI', credits: 48, movement: 2, symbol: 'P', tone: 'rose', website: 'patchwork.example' },
  { id: 'quietform', name: 'Quietform', tagline: 'Forms people actually finish.', category: 'Analytics', credits: 36, movement: 0, symbol: 'Q', tone: 'slate', website: 'quietform.example' },
]

const commonCategories = ['AI', 'Analytics', 'Design', 'Developer tools', 'Marketing', 'Productivity', 'Finance']
const sampleRankById = new Map(sampleProducts.map((product, index) => [product.id, index + 1]))
const tones = ['midnight', 'blue', 'ink', 'sky', 'coral', 'mint', 'lavender', 'amber', 'teal', 'rose', 'slate']

function mapLeaderboardRow(row: PublicLeaderboardRecord, index: number): Product {
  const isCatalog = row.entry_type === 'catalog'
  return {
    id: isCatalog ? `catalog-${row.id}` : row.id,
    name: row.name,
    tagline: row.tagline,
    category: row.category,
    credits: Number(row.total_bid_credits ?? row.standing_bid ?? 0),
    movement: row.current_rank && row.previous_rank ? row.previous_rank - row.current_rank : 0,
    symbol: row.name.trim().slice(0, 1).toUpperCase() || '•',
    tone: tones[index % tones.length],
    website: row.website_url || row.canonical_url || '',
    logoUrl: row.logo_url,
    currentRank: row.current_rank,
    firstBidAt: row.accepted_at,
    createdAt: row.created_at,
    isCatalog,
    sourceProvider: row.source_provider ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    attributionText: row.attribution_text ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    pricingModel: row.pricing_model,
    pricingUrl: row.pricing_url,
    pricingVerifiedAt: row.pricing_verified_at,
    descriptionSourceUrl: row.description_source_url,
    descriptionVerifiedAt: row.description_verified_at,
    seoPath: row.seo_path ?? (isCatalog ? `/products/${row.slug}/` : undefined),
  }
}

function Logo({ product, small = false }: { product: Product; small?: boolean }) {
  return <span aria-hidden="true" className={`product-mark ${product.tone} ${small ? 'small' : ''}`}>{product.logoUrl ? <img src={product.logoUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : product.symbol}</span>
}

function App() {
  const [page, setPage] = useState<'discover' | 'founder'>('discover')
  const [category, setCategory] = useState('All products')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('rank')
  const [selected, setSelected] = useState<Product | null>(null)
  const [bidTarget, setBidTarget] = useState<Product | null>(null)
  const [bidInput, setBidInput] = useState('')
  const [bidSubmitting, setBidSubmitting] = useState(false)
  const [bidError, setBidError] = useState('')
  const [bidNotice, setBidNotice] = useState('')
  const [workspacePayload, setWorkspacePayload] = useState<{account?: {email_verified_at: string | null; subscription_status: string; subscription_valid_until: string | null; grace_period_ends_at: string | null}; wallet?: {available: number; reserved: number}} | null>(null)
  const [dialog, setDialog] = useState<'how' | 'submit' | 'signin' | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [liveProducts, setLiveProducts] = useState<Product[]>([])
  const [dataState, setDataState] = useState<'preview' | 'loading' | 'live' | 'error'>(supabaseConfigured ? 'loading' : 'preview')
  const [session, setSession] = useState<Session | null>(null)
  const [displayLimit, setDisplayLimit] = useState(25)

  useEffect(() => {
    let cancelled = false
    async function readWorkspace() {
      if (!supabase || !session) { setWorkspacePayload(null); return }
      const { data, error } = await supabase.rpc('get_founder_workspace')
      if (!cancelled && !error && data) setWorkspacePayload(data as typeof workspacePayload)
    }
    void readWorkspace()
    return () => { cancelled = true }
  }, [session])

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client) return
    let cancelled = false
    const loadLeaderboard = async () => {
      const { data, error } = await client.from('public_leaderboard').select('*').order('current_rank', { ascending: true, nullsFirst: false })
      if (cancelled) return
      if (error) {
        setDataState('error')
        setLiveProducts([])
        return
      }
      const rows = (data ?? []) as PublicLeaderboardRecord[]
      setLiveProducts(rows.map(mapLeaderboardRow))
      setDataState('live')
    }
    void loadLeaderboard()
    const refreshTimer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadLeaderboard() }, 30_000)
    return () => { cancelled = true; window.clearInterval(refreshTimer) }
  }, [])

  function getMinimumBoostForNextRank(product: Product) {
    const rank = product.currentRank ?? 999999
    const previous = liveProducts.find((candidate) => candidate.currentRank === rank - 1)
    if (!product.credits || product.credits <= 0) return 5
    if (!previous) return 5
    return Math.max(1, previous.credits - product.credits + 1)
  }

  function openProductBoost(product: Product) {
    if (!session) { setDialog('signin'); return }
    if (!supabase) { setBidError('Bidding is temporarily unavailable. Please refresh and try again.'); return }
    setBidError('')
    setBidNotice('')
    setBidTarget(product)
    setBidInput(String(getMinimumBoostForNextRank(product)))
  }

  async function submitInlineBid() {
    if (!supabase || !session || !bidTarget) return
    setBidError('')
    setBidNotice('')
    const amount = Number(bidInput)
    if (!Number.isSafeInteger(amount) || amount <= 0) { setBidError('Enter a whole number of credits.'); return }
    if (amount > (workspacePayload?.wallet?.available ?? 0)) { setBidError('Insufficient available credits.'); return }
    setBidSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('boost_leaderboard_entry', {
        p_entry_type: bidTarget.isCatalog ? 'catalog' : 'founder',
        p_entry_id: bidTarget.isCatalog ? bidTarget.id.replace(/^catalog-/, '') : bidTarget.id,
        p_amount: amount,
        p_idempotency_key: crypto.randomUUID(),
      })
      if (error) throw error
      const bidResult = data as { rank?: number; total_bid_credits?: number; added_credits?: number; entry_name?: string } | null
      setBidNotice(bidResult?.rank
        ? `Boost accepted. ${bidResult.entry_name ?? bidTarget.name} is now #${bidResult.rank} after adding ${amount.toLocaleString()} credits.`
        : `Boost accepted. Added ${amount.toLocaleString()} credits to ${bidTarget.name}.`)
      const [{ data: rows, error: rowsError }, { data: freshWorkspace }] = await Promise.all([
        supabase.from('public_leaderboard').select('*').order('current_rank', { ascending: true, nullsFirst: false }),
        supabase.rpc('get_founder_workspace'),
      ])
      if (!rowsError) setLiveProducts(((rows ?? []) as PublicLeaderboardRecord[]).map(mapLeaderboardRow))
      if (freshWorkspace) setWorkspacePayload(freshWorkspace as typeof workspacePayload)
      if (bidResult?.total_bid_credits !== undefined) {
        setBidTarget((previous) => previous ? ({ ...previous, credits: bidResult.total_bid_credits!, currentRank: bidResult.rank ?? previous.currentRank }) : previous)
      }
    } catch (cause) {
      setBidError(cause instanceof Error ? cause.message : 'Boost was not accepted.')
    } finally {
      setBidSubmitting(false)
    }
  }

  const allProducts = dataState === 'live' ? liveProducts : dataState === 'preview' ? sampleProducts : []
  const categories = useMemo(() => ['All products', ...new Set([...commonCategories, ...allProducts.map((product) => product.category)])], [allProducts])
  const rankById = new Map(allProducts.map((product, index) => [product.id,
    product.currentRank !== undefined && product.currentRank !== null ? product.currentRank : sampleRankById.get(product.id) ?? index + 1]))

  const products = useMemo(() => {
    const filtered = allProducts.filter((product) => {
      const matchesCategory = category === 'All products' || product.category === category
      const text = `${product.name} ${product.tagline} ${product.category}`.toLowerCase()
      return matchesCategory && text.includes(query.toLowerCase())
    })
    if (sort === 'rank') filtered.sort((a, b) =>
      (rankById.get(a.id) ?? 999999) - (rankById.get(b.id) ?? 999999)
    )
    if (sort === 'credits') filtered.sort((a, b) => b.credits - a.credits)
    if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name))
    return filtered
  }, [allProducts, category, query, sort, rankById])

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage('discover')} aria-label="SaaslistAtlas home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>Saaslist<span className="brand-atlas">Atlas</span></span>
        </button>
        <button className="mobile-menu-button" aria-label="Toggle navigation" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={19} /></button>
        <nav className={`main-nav ${mobileMenu ? 'open' : ''}`} aria-label="Main navigation">
          <button className={page === 'discover' ? 'active' : ''} onClick={() => { setPage('discover'); setMobileMenu(false) }}>Discover</button>
          <button className={page === 'discover' ? '' : ''} onClick={() => { setPage('discover'); setCategory('All products'); setMobileMenu(false) }}>Categories</button>
          <button className={page === 'founder' ? 'active' : ''} onClick={() => { setPage('founder'); setMobileMenu(false) }}>For founders</button>
        </nav>
        {page === 'discover' ? (
          <div className="header-actions">
            <label className={`searchbox ${mobileSearchOpen ? 'mobile-search-open' : ''}`} onClick={() => { if (window.innerWidth <= 700 && !mobileSearchOpen) setMobileSearchOpen(true) }}><Search size={16} /><input autoFocus={mobileSearchOpen} aria-label="Search products and categories" placeholder="Search products, categories…" value={query} onChange={(event) => { setQuery(event.target.value); setDisplayLimit(25) }} onKeyDown={(event) => { if (event.key === 'Escape') setMobileSearchOpen(false) }} /><kbd>/</kbd></label>
            <button className="text-button login-button" onClick={() => session ? void supabase?.auth.signOut() : setDialog('signin')}>{session ? 'Sign out' : 'Log in'}</button>
            <button className="button button-primary submit-button" onClick={() => session ? setPage('founder') : setDialog('submit')}>Submit a product</button>
          </div>
        ) : (
          <div className="header-actions">{session ? <span className="preview-chip"><span className="status-dot" /> {session.user.email}</span> : <span className="preview-chip"><span className="status-dot" /> Preview account</span>}{session ? <button className="button button-dark" onClick={() => void supabase?.auth.signOut()}>Sign out</button> : <button className="button button-dark" onClick={() => setDialog('signin')}>Sign in <ArrowRight size={15} /></button>}</div>
        )}
      </header>

      {page === 'discover' ? (
        <main className="page-content">
          <div className="page-heading">
            <div><h1>The SaaS directory</h1><p>Explore verified tools and see which products founders are backing.</p></div>
            
          </div>

          <div className={`preview-notice ${dataState === 'live' ? 'is-live' : ''}`}><Sparkles size={14} /><span>{dataState === 'live' && liveProducts.length > 0 ? <><strong>Unified live leaderboard</strong> — {liveProducts.length} founder and catalog listings rank together by cumulative bid credits.</> : dataState === 'live' ? <><strong>The directory is open</strong> — approved listings will appear here as they are published.</> : dataState === 'live' ? <><strong>Live directory</strong> — rankings and cumulative boosts loaded from SaaslistAtlas.</> : dataState === 'error' ? <><strong>Directory unavailable</strong> — database setup is incomplete or unreachable.</> : dataState === 'loading' ? <><strong>Loading directory</strong> — connecting to SaaslistAtlas.</> : <><strong>Illustrative preview</strong> — sample products and bid amounts; no live bids are shown.</>}</span></div>

          <div className="filter-row">
            <div className="category-tabs" role="tablist" aria-label="Filter by category">
              {categories.map((item) => <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'selected' : ''} onClick={() => { setCategory(item); setDisplayLimit(25) }}>{item}</button>)}
            </div>
            
          </div>

          <section className="leaderboard-layout single-column" aria-label="SaaS leaderboard">
            <div className="results-column">
              <div className="results-toolbar"><span>{products.length} products</span><label>Sort by <select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)}><option value="rank">Current rank</option><option value="credits">Cumulative credits</option><option value="name">Product name</option></select><ChevronDown size={13} /></label></div>
              <div className="table-head"><span>#</span><span>Product</span><span>Category</span><span>Cumulative bid</span><span aria-hidden="true"></span></div>
              {products.length ? products.slice(0, displayLimit).map((product) => {
                const rank = rankById.get(product.id) ?? null
                const nextBoost = getMinimumBoostForNextRank(product)
                return <div className="product-row" key={product.id}>
                  <span className="rank-number">{rank ? String(rank).padStart(2, '0') : '—'}</span>
                  <button className="product-identity" onClick={() => setSelected(product)} aria-label={`View ${product.name}, rank ${rank}`}><Logo product={product} /><span className="product-copy"><strong>{product.name}</strong><small>{product.tagline}</small></span></button>
                  <span className="product-category">{product.category}</span>
                  <span className="bid-value"><strong>{product.credits.toLocaleString()}</strong> <small>total credits</small></span>
                  <button className="product-boost product-boost-cta" onClick={() => openProductBoost(product)} aria-label={`Boost ${product.name} by credits`}><span>Boost listing</span><strong>from {nextBoost.toLocaleString()} credits</strong></button>
                </div>
              }) : <div className={`empty-state ${dataState === 'live' && liveProducts.length === 0 ? 'empty-directory' : ''}`}>
                {dataState === 'live' && liveProducts.length === 0 ? <span className="empty-emblem"><Compass size={22} /></span> : <Search size={20} />}
                <strong>{dataState === 'live' && liveProducts.length === 0 ? 'The leaderboard starts here' : 'No products found'}</strong>
                <span>{dataState === 'live' && liveProducts.length === 0 ? 'Be the first founder to introduce a product to SaaslistAtlas.' : 'Try another search or category.'}</span>
                <button onClick={() => dataState === 'live' && liveProducts.length === 0 ? setDialog('submit') : (setQuery(''), setCategory('All products'))}>{dataState === 'live' && liveProducts.length === 0 ? 'Submit the first product' : 'Clear filters'}</button>
              </div>}
              <div className="table-footer"><span>{dataState === 'preview' ? `Showing ${Math.min(products.length, displayLimit)} of 12 illustrative listings` : `Showing ${Math.min(products.length, displayLimit)} of ${products.length} ranked products`}</span><div className="table-footer-actions">{products.length > displayLimit && <button className="load-more-button" onClick={() => setDisplayLimit((limit) => Math.min(limit + 100, products.length))}>Load 100 more products <ArrowRight size={14} /></button>}<button onClick={() => { setCategory('All products'); setQuery(''); setSort('rank'); setDisplayLimit(25) }}>Clear filters <X size={13} /></button></div></div>
            </div>

          </section>

          <footer className="site-footer"><div className="footer-brand"><span className="brand-mark"><span /><span /><span /></span> Saaslist<span>Atlas</span></div><span>Find your next favorite tool.</span><div className="footer-links"><button onClick={() => setDialog('how')}>How it works</button><button onClick={() => setDialog('submit')}>Submit a product</button></div><small>© 2026 SaaslistAtlas</small></footer>
        </main>
      ) : session ? (
        <FounderWorkspace userId={session.user.id} email={session.user.email ?? ''} onSignOut={() => { void supabase?.auth.signOut() }} onHow={() => setDialog('how')} />
      ) : (
        <FounderDashboard onSignIn={() => setDialog('signin')} onHow={() => setDialog('how')} />
      )}

      {selected && <ProductDialog product={selected} rank={rankById.get(selected.id) ?? null} onClose={() => setSelected(null)} onBid={() => { const target = selected; setSelected(null); openProductBoost(target) }} preview={dataState !== 'live'} />}
      {bidTarget && <BoostDialog product={bidTarget} session={session} wallet={workspacePayload?.wallet ?? null} account={workspacePayload?.account ?? null} currentTotal={bidTarget.credits} leaderboard={allProducts} minimumAmount={getMinimumBoostForNextRank(bidTarget)} amount={bidInput} setAmount={setBidInput} submitting={bidSubmitting} error={bidError} notice={bidNotice} onClose={() => { setBidTarget(null); setBidError(''); setBidNotice('') }} onSubmit={submitInlineBid} onSignIn={() => { setBidTarget(null); setDialog('signin') }} />}
      {dialog === 'signin' ? <AuthDialog onClose={() => setDialog(null)} onSignedIn={() => { setDialog(null); setPage('founder') }} /> : dialog ? <InfoDialog type={dialog} onClose={() => setDialog(null)} onSignIn={() => setDialog('signin')} /> : null}
    </div>
  )
}

function FounderDashboard({ onSignIn, onHow }: { onSignIn: () => void; onHow: () => void }) {
  const [activeTab, setActiveTab] = useState('Your products')
  return <main className="founder-page">
    <div className="founder-title"><div><p className="founder-breadcrumb">Founder workspace <ChevronRight size={13} /> Overview</p><h1>Your founder workspace</h1><p className="founder-intro">Manage your listings and standing bids in one place.</p></div><button className="button button-primary" onClick={onSignIn}>Sign in to continue <ArrowRight size={15} /></button></div>
    <div className="preview-banner"><span className="preview-icon"><Sparkles size={16} /></span><div><strong>Preview mode</strong><span>This is a design preview. Sign in and connect the SaaslistAtlas database to view real account credits, listings, and bids.</span></div><button onClick={onHow}>How bidding works</button></div>
    <div className="balance-grid"><section className="balance-card"><span>Available credits</span><strong>—</strong><small>Sign in to view your balance</small></section><section className="balance-card"><span>Reserved for bids</span><strong>—</strong><small>Active standing bids</small></section><section className="balance-card"><span>Your current rank</span><strong>—</strong><small>Across eligible listings</small></section></div>
    <div className="workspace-tabs">{['Your products', 'Credit activity', 'Referrals'].map((tab) => <button key={tab} className={activeTab === tab ? 'current' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
    {activeTab === 'Your products' ? <section className="workspace-section"><div className="section-header"><div><h2>Your listings</h2><p>Your product standing bids and positions will appear here.</p></div><button className="button button-dark" onClick={onSignIn}><Plus size={15} /> Add a product</button></div><div className="workspace-empty"><span className="empty-emblem"><Compass size={22} /></span><h3>Your workspace starts here</h3><p>Sign in to manage listings, reserve credits, and see how your products rank.</p><button className="button button-primary" onClick={onSignIn}>Sign in to your account <ArrowRight size={15} /></button></div></section> : <section className="workspace-section"><div className="section-header"><div><h2>{activeTab}</h2><p>Available after you sign in and connect your account.</p></div></div><div className="workspace-empty compact"><span className="empty-emblem"><Trophy size={22} /></span><h3>Connect your account</h3><p>Your {activeTab.toLowerCase()} will show here once the database is configured.</p><button className="button button-primary" onClick={onSignIn}>Sign in <ArrowRight size={15} /></button></div></section>}
    <div className="reservation-explainer"><div className="reservation-icon"><Check size={17} /></div><div><strong>Your bid is a reservation, not a purchase.</strong><span>Credits stay yours while committed to a listing’s active standing bid. You can adjust or withdraw that bid under the published rules.</span></div><button onClick={onHow}>Read the rules <ArrowRight size={14} /></button></div>
  </main>
}

function ProductDialog({ product, rank, onClose, onBid, preview }: { product: Product; rank: number | null; onClose: () => void; onBid: () => void; preview: boolean }) {
  const websiteUrl = product.website.startsWith('https://') ? product.website : `https://${product.website}`
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="dialog product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title">
      <button className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      <div className="dialog-product-head"><Logo product={product} /><div><span className="sample-kicker">{preview ? 'Illustrative preview listing' : product.isCatalog ? 'Sourced directory listing' : 'Founder leaderboard listing'}</span><h2 id="product-dialog-title">{product.name}</h2><span>{product.category}</span></div></div>
      <p className="dialog-tagline">{product.tagline}</p>
      <div className="detail-stats">
        <div><span>Current position</span><strong>{rank ? `#${String(rank).padStart(2, '0')}` : '—'}</strong></div>
        <div><span>Cumulative bid</span><strong>{product.credits.toLocaleString()} <small>credits</small></strong></div>
        
      </div>
      <p className="detail-disclaimer">{product.isCatalog ? <>
        {product.descriptionSourceUrl ? <>Description checked against the <a href={product.descriptionSourceUrl} target="_blank" rel="noreferrer">official product page</a>{product.descriptionVerifiedAt ? ` on ${new Date(product.descriptionVerifiedAt).toLocaleDateString()}` : ''}. </> : <>Description provided by ComparEdge under CC BY 4.0. </>}
        Sourced from <a href={product.sourceUrl} target="_blank" rel="noreferrer">{product.sourceProvider}</a>. {product.attributionText} Verified {product.verifiedAt ? new Date(product.verifiedAt).toLocaleDateString() : 'date unavailable'}.
        {product.pricingUrl && <> Pricing details: <a href={product.pricingUrl} target="_blank" rel="noreferrer">official pricing page</a>{product.pricingVerifiedAt ? ` (checked ${new Date(product.pricingVerifiedAt).toLocaleDateString()})` : ''}.</>}
      </> : preview ? 'This listing and its bid are sample data for the interface preview. No live bidding is taking place.' : 'Ranks are based on cumulative credits added by eligible users. Higher totals rank above lower totals.'}</p>
      <div className="dialog-actions">
        {product.isCatalog && product.seoPath && <a className="button button-light" href={product.seoPath}>Product profile <ExternalLink size={14} /></a>}
        <a className="button button-light" href={websiteUrl} target={preview ? undefined : '_blank'} rel="noreferrer" onClick={preview ? (event) => event.preventDefault() : undefined}>Visit website <ExternalLink size={14} /></a>
        {!preview && <button className="button button-primary" onClick={onBid}>Boost this listing <ArrowRight size={14} /></button>}
      </div>
    </section>
  </div>
}

function BoostDialog({ product, session, wallet, account, currentTotal, leaderboard, minimumAmount, amount, setAmount, submitting, error, notice, onClose, onSubmit, onSignIn }: {
  product: Product
  session: Session | null
  wallet: {available:number; reserved:number} | null
  account: {email_verified_at:string|null; subscription_status:string; subscription_valid_until:string|null; grace_period_ends_at:string|null} | null
  currentTotal: number
  leaderboard: Product[]
  minimumAmount: number
  amount: string
  setAmount: (value:string)=>void
  submitting: boolean
  error: string
  notice: string
  onClose: ()=>void
  onSubmit: ()=>void
  onSignIn: ()=>void
}) {
  const next = Number(amount)
  const projectedTotal = currentTotal + (Number.isSafeInteger(next) && next > 0 ? next : 0)
  const projectedRank = leaderboard.filter((candidate) => {
    if (candidate.id === product.id) return false
    if (candidate.credits !== projectedTotal) return candidate.credits > projectedTotal
    const candidateTime = candidate.firstBidAt ? new Date(candidate.firstBidAt).getTime() : Number.POSITIVE_INFINITY
    const productTime = product.firstBidAt ? new Date(product.firstBidAt).getTime() : Number.POSITIVE_INFINITY
    if (candidateTime !== productTime) return candidateTime < productTime
    const candidateCreated = candidate.createdAt ? new Date(candidate.createdAt).getTime() : 0
    const productCreated = product.createdAt ? new Date(product.createdAt).getTime() : 0
    return candidateCreated !== productCreated ? candidateCreated < productCreated : candidate.id.localeCompare(product.id) < 0
  }).length + 1
  const eligible = Boolean(account?.email_verified_at && ['active','trialing'].includes(account.subscription_status)
    && (!account.subscription_valid_until || new Date(account.subscription_valid_until).getTime() > Date.now()))
  const validAmount = Number.isSafeInteger(next) && next >= minimumAmount && next <= (wallet?.available ?? 0)
  return <div className="overlay" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget) onClose()}}>
    <section className="dialog inline-bid-card" role="dialog" aria-modal="true" aria-labelledby="inline-bid-title">
      <style>{`
        .inline-bid-card { max-height: min(88dvh, 760px); display: flex; flex-direction: column; overflow: hidden; }
        .inline-bid-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 2px 8px 0; }
        .inline-bid-actions { flex-shrink: 0; position: sticky; bottom: 0; z-index: 2; background: var(--surface, #fff); padding-top: 12px; }
        @media (max-width: 600px) { .inline-bid-card { width: min(100%, 520px); max-height: 88dvh; padding: 18px; } .inline-bid-actions { display: grid; grid-template-columns: 1fr; } .inline-bid-actions .button { width: 100%; } }
      `}</style>
      <div className="inline-bid-scroll">
        <button className="close-button" onClick={onClose} aria-label="Close"><X size={18}/></button>
        <span className="sample-kicker">Cumulative credit boost · live ranking</span>
        <div className="inline-bid-product"><Logo product={product}/><div><h3 id="inline-bid-title">Boost this listing</h3><p>{product.name} · credits are added to this product’s cumulative bid total.</p></div></div>
        <div className="inline-bid-rank">
          <div className="inline-bid-stat"><span>Current rank</span><strong>{product.currentRank ? '#'+product.currentRank : '—'}</strong></div>
          <div className="inline-bid-stat"><span>Cumulative total</span><strong>{currentTotal.toLocaleString()} cr</strong></div>
          <div className="inline-bid-stat"><span>Projected rank</span><strong>#{projectedRank}</strong></div>
          <div className="inline-bid-stat"><span>Available credits</span><strong>{wallet ? wallet.available.toLocaleString() : '—'}</strong></div>
        </div>
        {session ? <>
          {!eligible && <div className="inline-bid-message error">Verified email and an eligible subscription are required for boosting.</div>}
          <div className="inline-bid-amount"><label htmlFor="inline-bid-amount">Credits to add</label><input id="inline-bid-amount" type="number" min={minimumAmount} step="1" value={amount} onChange={(event)=>setAmount(event.target.value)} /></div>
          <p className="inline-bid-helper">This adds <strong>{Number.isSafeInteger(next) && next > 0 ? next.toLocaleString() : '0'} credits</strong> to {product.name}. Its cumulative total would become <strong>{projectedTotal.toLocaleString()} credits</strong>. Higher cumulative totals rank first; the position is recalculated after acceptance and may change when other people boost listings.</p>
          <div className="standing-bid-duration"><strong>How ranking works</strong><p>Every eligible listing—including the 300 catalog products—uses the same leaderboard. Each accepted boost adds to that listing’s cumulative total; higher totals move above lower totals. The system does not promise a fixed position based on which row you click.</p><p><strong>Referral-earned credits can be used</strong> as long as they are available in your wallet and your account is eligible to bid.</p></div>
        </> : <p className="inline-bid-signin">Sign in to use available credits to boost this listing.</p>}
        {error && <div className="inline-bid-message error" role="alert">{error}</div>}
        {notice && <div className="inline-bid-message notice" role="status">{notice}</div>}
      </div>
      <div className="inline-bid-actions"><button className="button button-light" onClick={onClose}>Close</button>{session ? <button className="button button-primary" onClick={onSubmit} disabled={submitting || !eligible || !validAmount}>{submitting ? <><LoaderCircle size={15}/> Adding credits…</> : `Add ${Number.isSafeInteger(next) && next > 0 ? next.toLocaleString() : '0'} credits and boost listing`}</button> : <button className="button button-primary" onClick={onSignIn}>Sign in to boost <ArrowRight size={14}/></button>}</div>
    </section>
  </div>
}

function InfoDialog({ type, onClose, onSignIn }: { type: 'how' | 'submit' | 'signin'; onClose: () => void; onSignIn: () => void }) {
  const titles = { how: 'How the leaderboard works', submit: 'Submit your product', signin: 'Welcome back' }
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="dialog info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title"><button className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button><span className="modal-mark">{type === 'how' ? <Trophy size={19} /> : type === 'submit' ? <Plus size={19} /> : <Compass size={19} />}</span><h2 id="info-dialog-title">{titles[type]}</h2>{type === 'how' ? <><p>Every product is ordered by its current eligible standing bid. A bid reserves credits while it remains active.</p><ol className="rules-list"><li><span>01</span><div><strong>Position follows the standing bid</strong><small>Higher bids rank above lower bids. Equal bids are ordered by when the accepted bid was recorded.</small></div></li><li><span>02</span><div><strong>Credits stay reserved</strong><small>Increasing a bid reserves only the difference. Lower-ranked listings keep their active reservations until changed or withdrawn.</small></div></li><li><span>03</span><div><strong>Every change is confirmed</strong><small>The server confirms bids and ranks. A displayed projection can change if another bid is accepted first.</small></div></li></ol><p className="detail-disclaimer">Preview data is illustrative. Live bids require an eligible founder listing, an active subscription, and available credits.</p></> : type === 'submit' ? <><p>Founders can publish a product after signing in with a verified email and an eligible paid subscription. Listing limits are enforced by plan.</p><div className="form-note"><span className="status-dot" /> Sign in, verify your email, and activate a subscription to publish within your plan limit.</div><button className="button button-primary button-wide" onClick={onSignIn}>Continue to sign in <ArrowRight size={14} /></button></> : <><p>Sign in to open your founder workspace. You can publish an eligible listing and place a standing bid there. Bids are accepted only when your subscription is active and your wallet has enough available credits.</p><div className="auth-placeholder"><span className="auth-icon">S</span><span><strong>Founder account</strong><small>Sign in to manage your listings, referral rewards, and available bid credits.</small></span><span className="coming-soon">Founder workspace</span></div><button className="button button-primary button-wide" onClick={onClose}>Close <ArrowRight size={14} /></button><small className="modal-footnote">Only an approved founder-owned listing can be bid on; sourced directory listings stay separate.</small></>}</section></div>
}

export default App
