import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Check, ChevronDown, ChevronRight,
  Compass, ExternalLink, Menu, Plus, Search, Sparkles,
  Trophy, X, Zap, LoaderCircle,
} from 'lucide-react'
import { supabase, supabaseConfigured } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import AuthDialog from './AuthDialog'
import FounderWorkspace from './FounderWorkspace'
import type { PublicCatalogProductRecord, PublicLeaderboardRecord } from './lib/supabase'

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
  const [bidTargetRank, setBidTargetRank] = useState(1)
  const [bidSubmitting, setBidSubmitting] = useState(false)
  const [bidError, setBidError] = useState('')
  const [bidNotice, setBidNotice] = useState('')
  const [workspacePayload, setWorkspacePayload] = useState<{account?: {email_verified_at: string | null; subscription_status: string; subscription_valid_until: string | null; grace_period_ends_at: string | null}; wallet?: {available: number; reserved: number}} | null>(null)
  const [dialog, setDialog] = useState<'how' | 'submit' | 'signin' | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [liveProducts, setLiveProducts] = useState<Product[]>([])
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([])
  const [dataState, setDataState] = useState<'preview' | 'loading' | 'live' | 'error'>(supabaseConfigured ? 'loading' : 'preview')
  const [session, setSession] = useState<Session | null>(null)

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
      const [leaderboardResult, catalogResult] = await Promise.all([
        client.from('public_leaderboard').select('*').order('current_rank', { ascending: true, nullsFirst: false }),
        client.from('published_catalog_products').select('id,name,slug,canonical_url,description,category,subcategory,pricing_model,pricing_url,pricing_verified_at,source_provider,source_url,attribution_text,verified_at,logo_path,logo_source_url,logo_verified_at,description_source_url,description_verified_at').order('name'),
      ])
      if (cancelled) return
      if (leaderboardResult.error || catalogResult.error) {
        setDataState('error')
        setLiveProducts([])
        setCatalogProducts([])
        return
      }
      const rows = (leaderboardResult.data ?? []) as PublicLeaderboardRecord[]
      const sourcedRows = (catalogResult.data ?? []) as PublicCatalogProductRecord[]
      setLiveProducts(rows.map((row, index) => {
        const rank = row.current_rank
        const previousRank = row.previous_rank
        return {
          id: row.id,
          name: row.name,
          tagline: row.tagline,
          category: row.category,
          credits: row.standing_bid ?? 0,
          movement: rank && previousRank ? previousRank - rank : 0,
          symbol: row.name.trim().slice(0, 1).toUpperCase() || '•',
          tone: tones[index % tones.length],
          website: row.website_url,
          logoUrl: row.logo_url,
          currentRank: rank,
        }
      }))
      setCatalogProducts(sourcedRows.map((row, index) => ({
        id: `catalog-${row.id}`,
        name: row.name,
        tagline: row.description,
        category: row.category,
        credits: 0,
        movement: 0,
        symbol: row.name.trim().slice(0, 1).toUpperCase() || '•',
        tone: tones[(index + rows.length) % tones.length],
        website: row.canonical_url,
        currentRank: null,
        isCatalog: true,
        sourceProvider: row.source_provider,
        sourceUrl: row.source_url,
        attributionText: row.attribution_text,
        verifiedAt: row.verified_at,
        pricingModel: row.pricing_model,
        pricingUrl: row.pricing_url,
        pricingVerifiedAt: row.pricing_verified_at,
        logoUrl: row.logo_path,
        descriptionSourceUrl: row.description_source_url,
        descriptionVerifiedAt: row.description_verified_at,
        seoPath: `/products/${row.slug}/`,
      })))
      setDataState('live')
    }
    void loadLeaderboard()
    const refreshTimer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadLeaderboard() }, 30_000)
    return () => { cancelled = true; window.clearInterval(refreshTimer) }
  }, [])



  function getMinimumBidForRank(productId: string, targetRank: number) {
    const others = liveProducts
      .filter((candidate) => candidate.id !== productId)
      .slice()
      .sort((a, b) => (a.currentRank ?? 999999) - (b.currentRank ?? 999999))
    const rowAtTarget = others[targetRank - 1]
    return rowAtTarget && rowAtTarget.credits > 0 ? rowAtTarget.credits + 5 : 5
  }

  function openBidModal(product: Product) {
    if (product.isCatalog) return
    if (!session) { setDialog('signin'); return }
    setBidError('')
    setBidNotice('')
    setBidTarget(product)
    const targetRank = Math.min(100, Math.max(1, product.currentRank ?? 1))
    const minimum = getMinimumBidForRank(product.id, targetRank)
    setBidTargetRank(targetRank)
    setBidInput(String(Math.max((product.credits ?? 0) + 5, minimum)))
  }

  async function submitInlineBid() {
    if (!supabase || !session || !bidTarget) return
    setBidError('')
    setBidNotice('')
    const amount = Number(bidInput)
    if (!Number.isSafeInteger(amount) || amount <= 0) { setBidError('Enter a whole number of credits.'); return }
    setBidSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('place_or_update_bid', {
        p_product_id: bidTarget.id,
        p_amount: amount,
        p_idempotency_key: crypto.randomUUID(),
        p_target_rank: bidTargetRank,
      })
      if (error) throw error
      const bidResult = data as { rank?: number; additional_reserved?: number; released_credits?: number } | null
      setBidNotice(bidResult?.rank ? `Standing bid accepted. Your listing is now #${bidResult.rank}.` : 'Standing bid accepted. The leaderboard has been updated.')
      const [{ data: rows, error: rowsError }, { data: freshWorkspace }] = await Promise.all([
        supabase.from('public_leaderboard').select('*').order('current_rank', { ascending: true, nullsFirst: false }),
        supabase.rpc('get_founder_workspace'),
      ])
      if (!rowsError) {
        setLiveProducts(((rows ?? []) as PublicLeaderboardRecord[]).map((row, index) => ({
          id: row.id, name: row.name, tagline: row.tagline, category: row.category,
          credits: row.standing_bid ?? 0, movement: row.current_rank && row.previous_rank ? row.previous_rank - row.current_rank : 0,
          symbol: row.name.trim().slice(0, 1).toUpperCase() || '•', tone: tones[index % tones.length],
          website: row.website_url, logoUrl: row.logo_url, currentRank: row.current_rank,
        })))
      }
      if (freshWorkspace) setWorkspacePayload(freshWorkspace as typeof workspacePayload)
      setBidTarget((previous) => previous ? ({ ...previous, credits: amount, currentRank: bidResult?.rank ?? previous.currentRank }) : previous)
    } catch (cause) {
      setBidError(cause instanceof Error ? cause.message : 'Bid was not accepted.')
    } finally {
      setBidSubmitting(false)
    }
  }

  const allProducts = dataState === 'live' ? [...liveProducts, ...catalogProducts] : dataState === 'preview' ? sampleProducts : []
  const categories = useMemo(() => ['All products', ...new Set([...commonCategories, ...allProducts.map((product) => product.category)])], [allProducts])
  const rankById = new Map(allProducts.map((product, index) => [product.id,
    product.currentRank !== undefined ? product.currentRank : sampleRankById.get(product.id) ?? index + 1]))

  const products = useMemo(() => {
    const filtered = allProducts.filter((product) => {
      const matchesCategory = category === 'All products' || product.category === category
      const text = `${product.name} ${product.tagline} ${product.category}`.toLowerCase()
      return matchesCategory && text.includes(query.toLowerCase())
    })
    if (sort === 'rank') filtered.sort((a, b) => {
      if (a.isCatalog !== b.isCatalog) return a.isCatalog ? 1 : -1
      return (a.currentRank ?? 999999) - (b.currentRank ?? 999999)
    })
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
            <label className={`searchbox ${mobileSearchOpen ? 'mobile-search-open' : ''}`} onClick={() => { if (window.innerWidth <= 700 && !mobileSearchOpen) setMobileSearchOpen(true) }}><Search size={16} /><input autoFocus={mobileSearchOpen} aria-label="Search products and categories" placeholder="Search products, categories…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setMobileSearchOpen(false) }} /><kbd>/</kbd></label>
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

          <div className={`preview-notice ${dataState === 'live' ? 'is-live' : ''}`}><Sparkles size={14} /><span>{dataState === 'live' && catalogProducts.length > 0 ? <><strong>Curated SaaS directory</strong> — {catalogProducts.length} sourced tools, with founder bids and rankings shown separately.</> : dataState === 'live' && liveProducts.length === 0 ? <><strong>The directory is open</strong> — approved products will appear here as they are published.</> : dataState === 'live' ? <><strong>Live directory</strong> — rankings and standing bids loaded from SaaslistAtlas.</> : dataState === 'error' ? <><strong>Directory unavailable</strong> — database setup is incomplete or unreachable.</> : dataState === 'loading' ? <><strong>Loading directory</strong> — connecting to SaaslistAtlas.</> : <><strong>Illustrative preview</strong> — sample products and bid amounts; no live bids are shown.</>}</span></div>

          <div className="filter-row">
            <div className="category-tabs" role="tablist" aria-label="Filter by category">
              {categories.map((item) => <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            
          </div>

          <section className="leaderboard-layout single-column" aria-label="SaaS leaderboard">
            <div className="results-column">
              <div className="results-toolbar"><span>{products.length} products</span><label>Sort by <select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)}><option value="rank">Current rank</option><option value="credits">Standing bid</option><option value="name">Product name</option></select><ChevronDown size={13} /></label></div>
              <div className="table-head"><span>#</span><span>Product</span><span>Category</span><span>Standing bid</span><span aria-hidden="true"></span></div>
              {products.length ? products.map((product) => {
                const rank = rankById.get(product.id) ?? null
                return <div className="product-row" key={product.id}>
                  <span className="rank-number">{rank ? String(rank).padStart(2, '0') : '—'}</span>
                  <button className="product-identity" onClick={() => setSelected(product)} aria-label={`View ${product.name}, rank ${rank}`}><Logo product={product} /><span className="product-copy"><strong>{product.name}</strong><small>{product.tagline}</small></span></button>
                  <span className="product-category">{product.category}</span>
                  <span className="bid-value">{product.isCatalog ? <small>Directory listing</small> : product.credits > 0 ? <><strong>{product.credits}</strong> <small>credits</small></> : <small>No bid</small>}</span>
                  
                  {product.isCatalog ? <button className="product-boost" onClick={() => setSelected(product)} aria-label={`View ${product.name}`}>Details <ArrowRight size={14} /></button> : rank && rank <= 100 ? (() => { const targetRank = Math.min(100, Math.max(1, rank)); const minimum = Math.max(product.credits + 5, getMinimumBidForRank(product.id, targetRank)); return <button className="product-boost" onClick={() => openBidModal(product)} aria-label={`Pay ${minimum.toLocaleString()} credits for position #${targetRank} with ${product.name}`}><Zap size={14} /> Pay {minimum.toLocaleString()} credits for position #{targetRank}</button> })() : <span className="directory-action">Outside top 100</span>}
                </div>
              }) : <div className={`empty-state ${dataState === 'live' && liveProducts.length === 0 ? 'empty-directory' : ''}`}>
                {dataState === 'live' && liveProducts.length === 0 ? <span className="empty-emblem"><Compass size={22} /></span> : <Search size={20} />}
                <strong>{dataState === 'live' && liveProducts.length === 0 ? 'The leaderboard starts here' : 'No products found'}</strong>
                <span>{dataState === 'live' && liveProducts.length === 0 ? 'Be the first founder to introduce a product to SaaslistAtlas.' : 'Try another search or category.'}</span>
                <button onClick={() => dataState === 'live' && liveProducts.length === 0 ? setDialog('submit') : (setQuery(''), setCategory('All products'))}>{dataState === 'live' && liveProducts.length === 0 ? 'Submit the first product' : 'Clear filters'}</button>
              </div>}
              <div className="table-footer"><span>{dataState === 'preview' ? `Showing ${products.length} of 12 illustrative listings` : `${products.length} directory listings`}</span><button onClick={() => { setCategory('All products'); setQuery(''); setSort('rank') }}>Clear filters <X size={13} /></button></div>
            </div>

          </section>

          <footer className="site-footer"><div className="footer-brand"><span className="brand-mark"><span /><span /><span /></span> Saaslist<span>Atlas</span></div><span>Find your next favorite tool.</span><div className="footer-links"><button onClick={() => setDialog('how')}>How it works</button><button onClick={() => setDialog('submit')}>Submit a product</button></div><small>© 2026 SaaslistAtlas</small></footer>
        </main>
      ) : session ? (
        <FounderWorkspace userId={session.user.id} email={session.user.email ?? ''} onSignOut={() => { void supabase?.auth.signOut() }} onHow={() => setDialog('how')} />
      ) : (
        <FounderDashboard onSignIn={() => setDialog('signin')} onHow={() => setDialog('how')} />
      )}

      {selected && <ProductDialog product={selected} rank={rankById.get(selected.id) ?? null} onClose={() => setSelected(null)} onBid={() => { const target = selected; setSelected(null); openBidModal(target) }} preview={dataState !== 'live'} />}
      {bidTarget && <InlineBidDialog product={bidTarget} session={session} wallet={workspacePayload?.wallet ?? null} account={workspacePayload?.account ?? null} currentBid={bidTarget.credits} targetRank={bidTargetRank} setTargetRank={(rank) => { setBidTargetRank(rank); setBidInput(String(Math.max(bidTarget.credits + 5, getMinimumBidForRank(bidTarget.id, rank)))) }} minimumBid={getMinimumBidForRank(bidTarget.id, bidTargetRank)} amount={bidInput} setAmount={setBidInput} submitting={bidSubmitting} error={bidError} notice={bidNotice} onClose={() => { setBidTarget(null); setBidError(''); setBidNotice('') }} onSubmit={submitInlineBid} onSignIn={() => { setBidTarget(null); setDialog('signin') }} />}
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
        <div><span>{product.isCatalog ? 'Pricing model' : 'Standing bid'}</span><strong>{product.isCatalog ? product.pricingModel ?? 'Not listed' : product.credits > 0 ? product.credits : '—'} <small>{!product.isCatalog && product.credits > 0 ? 'credits' : ''}</small></strong></div>
        
      </div>
      <p className="detail-disclaimer">{product.isCatalog ? <>
        {product.descriptionSourceUrl ? <>Description checked against the <a href={product.descriptionSourceUrl} target="_blank" rel="noreferrer">official product page</a>{product.descriptionVerifiedAt ? ` on ${new Date(product.descriptionVerifiedAt).toLocaleDateString()}` : ''}. </> : <>Description provided by ComparEdge under CC BY 4.0. </>}
        Sourced from <a href={product.sourceUrl} target="_blank" rel="noreferrer">{product.sourceProvider}</a>. {product.attributionText} Verified {product.verifiedAt ? new Date(product.verifiedAt).toLocaleDateString() : 'date unavailable'}.
        {product.pricingUrl && <> Pricing details: <a href={product.pricingUrl} target="_blank" rel="noreferrer">official pricing page</a>{product.pricingVerifiedAt ? ` (checked ${new Date(product.pricingVerifiedAt).toLocaleDateString()})` : ''}.</>}
      </> : preview ? 'This listing and its bid are sample data for the interface preview. No live bidding is taking place.' : 'Ranks reflect current eligible standing bids. A bid reservation remains active until changed or withdrawn.'}</p>
      <div className="dialog-actions">
        {product.isCatalog && product.seoPath && <a className="button button-light" href={product.seoPath}>Product profile <ExternalLink size={14} /></a>}
        <a className="button button-light" href={websiteUrl} target={preview ? undefined : '_blank'} rel="noreferrer" onClick={preview ? (event) => event.preventDefault() : undefined}>Visit website <ExternalLink size={14} /></a>
        {!product.isCatalog && <button className="button button-primary" onClick={onBid}>Bid to rank with your product <ArrowRight size={14} /></button>}
      </div>
    </section>
  </div>
}

function InlineBidDialog({ product, session, wallet, account, currentBid, targetRank, setTargetRank, minimumBid, amount, setAmount, submitting, error, notice, onClose, onSubmit, onSignIn }: {
  product: Product
  session: Session | null
  wallet: {available:number; reserved:number} | null
  account: {email_verified_at:string|null; subscription_status:string; subscription_valid_until:string|null; grace_period_ends_at:string|null} | null
  currentBid: number
  targetRank: number
  setTargetRank: (rank:number)=>void
  minimumBid: number
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
  const extra = Math.max(0, next - currentBid)
  const eligible = Boolean(account?.email_verified_at && ['active','trialing'].includes(account.subscription_status)
    && (!account.subscription_valid_until || new Date(account.subscription_valid_until).getTime() > Date.now()))
  return <div className="overlay" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget) onClose()}}>
    <section className="dialog inline-bid-card" role="dialog" aria-modal="true" aria-labelledby="inline-bid-title">
      <button className="close-button" onClick={onClose} aria-label="Close"><X size={18}/></button>
      <span className="sample-kicker">Live standing bid · position can change</span>
      <div className="inline-bid-product"><Logo product={product}/><div><h3 id="inline-bid-title">Place a standing bid</h3><p>{product.name} · bid without leaving the leaderboard.</p></div></div>
      <div className="inline-bid-rank">
        <div className="inline-bid-stat"><span>Current rank</span><strong>{product.currentRank ? '#'+product.currentRank : 'Unranked'}</strong></div>
        <div className="inline-bid-stat"><span>Current bid</span><strong>{currentBid.toLocaleString()} cr</strong></div>
        <div className="inline-bid-stat"><span>Available credits</span><strong>{wallet ? wallet.available.toLocaleString() : '—'}</strong></div>
      </div>
      {session ? <>
        {!eligible && <div className="inline-bid-message error">Verified email and an eligible subscription are required for bidding.</div>}
        <div className="inline-bid-amount"><label htmlFor="inline-bid-target-rank">Target position (1–100)</label><select id="inline-bid-target-rank" value={targetRank} onChange={(event)=>setTargetRank(Number(event.target.value))}>{Array.from({length:100},(_,index)=>index+1).map((rank)=><option key={rank} value={rank}>Position #{rank}</option>)}</select></div>
        <div className="inline-bid-amount"><label htmlFor="inline-bid-amount">Your total standing bid (credits)</label><input id="inline-bid-amount" type="number" min={minimumBid} step="1" value={amount} onChange={(event)=>setAmount(event.target.value)} /></div>
        <p className="inline-bid-helper">Minimum to reach position #{targetRank} or higher: <strong>{minimumBid.toLocaleString()} credits</strong>. Higher bids rank above lower bids, so your final position may be better than the selected target. {extra.toLocaleString()} additional credits would be reserved if your bid increases; reducing your bid releases the difference.</p><div className="standing-bid-duration"><strong>How long will your position last?</strong><p>Your bid has no fixed time limit. It stays active until you change or withdraw it, or your listing becomes ineligible. If another eligible listing places a higher standing bid, your listing automatically moves down the rankings. A higher bid can overtake yours at any time.</p><p><strong>Paying credits does not guarantee a permanent position.</strong> Rankings update as eligible standing bids change.</p></div>
      </> : <><p className="inline-bid-signin">Sign in to reserve credits and place a standing bid on this listing.</p></>}
      {error && <div className="inline-bid-message error" role="alert">{error}</div>}
      {notice && <div className="inline-bid-message notice" role="status">{notice}</div>}
      <div className="inline-bid-actions"><button className="button button-light" onClick={onClose}>Close</button>{session ? <button className="button button-primary" onClick={onSubmit} disabled={submitting || !eligible || !Number.isSafeInteger(next) || next<minimumBid || next<=0 || extra>(wallet?.available ?? 0)}>{submitting ? <><LoaderCircle size={15}/> Placing bid…</> : `Pay ${next.toLocaleString()} credits to reach #${targetRank} or higher`}</button> : <button className="button button-primary" onClick={onSignIn}>Sign in to bid <ArrowRight size={14}/></button>}</div>
    </section>
  </div>
}

function InfoDialog({ type, onClose, onSignIn }: { type: 'how' | 'submit' | 'signin'; onClose: () => void; onSignIn: () => void }) {
  const titles = { how: 'How the leaderboard works', submit: 'Submit your product', signin: 'Welcome back' }
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="dialog info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title"><button className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button><span className="modal-mark">{type === 'how' ? <Trophy size={19} /> : type === 'submit' ? <Plus size={19} /> : <Compass size={19} />}</span><h2 id="info-dialog-title">{titles[type]}</h2>{type === 'how' ? <><p>Every product is ordered by its current eligible standing bid. A bid reserves credits while it remains active.</p><ol className="rules-list"><li><span>01</span><div><strong>Position follows the standing bid</strong><small>Higher bids rank above lower bids. Equal bids are ordered by when the accepted bid was recorded.</small></div></li><li><span>02</span><div><strong>Credits stay reserved</strong><small>Increasing a bid reserves only the difference. Lower-ranked listings keep their active reservations until changed or withdrawn.</small></div></li><li><span>03</span><div><strong>Every change is confirmed</strong><small>The server confirms bids and ranks. A displayed projection can change if another bid is accepted first.</small></div></li></ol><p className="detail-disclaimer">Preview data is illustrative. Live bids require an eligible founder listing, an active subscription, and available credits.</p></> : type === 'submit' ? <><p>Founders can publish a product after signing in with a verified email and an eligible paid subscription. Listing limits are enforced by plan.</p><div className="form-note"><span className="status-dot" /> Sign in, verify your email, and activate a subscription to publish within your plan limit.</div><button className="button button-primary button-wide" onClick={onSignIn}>Continue to sign in <ArrowRight size={14} /></button></> : <><p>Sign in to open your founder workspace. You can publish an eligible listing and place a standing bid there. Bids are accepted only when your subscription is active and your wallet has enough available credits.</p><div className="auth-placeholder"><span className="auth-icon">S</span><span><strong>Founder account</strong><small>Sign in to manage your listings, referral rewards, and available bid credits.</small></span><span className="coming-soon">Founder workspace</span></div><button className="button button-primary button-wide" onClick={onClose}>Close <ArrowRight size={14} /></button><small className="modal-footnote">Only an approved founder-owned listing can be bid on; sourced directory listings stay separate.</small></>}</section></div>
}

export default App
