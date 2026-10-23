import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight,
  CircleHelp, Compass, ExternalLink, Filter, Menu, Plus, Search, Sparkles,
  Target, Trophy, X,
} from 'lucide-react'
import { supabase, supabaseConfigured } from './lib/supabase'
import type { PublicCatalogProductRecord, PublicLeaderboardRecord } from './lib/supabase'
import { rankTargetCredits } from './lib/rank-targets'

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
  return <span aria-hidden="true" className={`product-mark ${product.tone} ${small ? 'small' : ''}`}>{product.symbol}{product.logoUrl && <img src={product.logoUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} />}</span>
}

function App() {
  const [page, setPage] = useState<'discover' | 'founder'>('discover')
  const [category, setCategory] = useState('All products')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('rank')
  const [selected, setSelected] = useState<Product | null>(null)
  const [rankGuideOpen, setRankGuideOpen] = useState(false)
  const [rankTarget, setRankTarget] = useState(1)
  const [dialog, setDialog] = useState<'how' | 'submit' | 'signin' | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [status, setStatus] = useState('All active')
  const [liveProducts, setLiveProducts] = useState<Product[]>([])
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([])
  const [dataState, setDataState] = useState<'preview' | 'loading' | 'live' | 'error'>(supabaseConfigured ? 'loading' : 'preview')

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

  const allProducts = dataState === 'live' ? [...liveProducts, ...catalogProducts] : dataState === 'preview' ? sampleProducts : []
  const categories = useMemo(() => ['All products', ...new Set([...commonCategories, ...allProducts.map((product) => product.category)])], [allProducts])
  const rankById = new Map(allProducts.map((product, index) => [product.id,
    product.currentRank !== undefined ? product.currentRank : sampleRankById.get(product.id) ?? index + 1]))

  const products = useMemo(() => {
    const filtered = allProducts.filter((product) => {
      const matchesCategory = category === 'All products' || product.category === category
      const text = `${product.name} ${product.tagline} ${product.category}`.toLowerCase()
      const withinStatus = status === 'All active' || (status === 'Top 10 only' && (rankById.get(product.id) ?? 99) <= 10)
      return matchesCategory && withinStatus && text.includes(query.toLowerCase())
    })
    if (sort === 'credits') filtered.sort((a, b) => b.credits - a.credits)
    if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name))
    return filtered
  }, [allProducts, category, query, sort, status, rankById])

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
            <button className="text-button login-button" onClick={() => setDialog('signin')}>Log in</button>
            <button className="button button-primary submit-button" onClick={() => setDialog('submit')}>Submit a product</button>
          </div>
        ) : (
          <div className="header-actions"><span className="preview-chip"><span className="status-dot" /> Preview account</span><button className="button button-dark" onClick={() => setDialog('signin')}>Sign in <ArrowRight size={15} /></button></div>
        )}
      </header>

      {page === 'discover' ? (
        <main className="page-content">
          <div className="page-heading">
            <div><h1>The SaaS directory</h1><p>Explore verified tools and see which products founders are backing.</p></div>
            <button className="ranking-note" onClick={() => setRankGuideOpen(true)} aria-label="View bid targets and choose a rank"><span><Target size={16} /> Bid for a position <ArrowRight size={15} /></span><small><strong>1,770 credits</strong> for rank 1 · targets step down by 180 credits.</small></button>
          </div>

          <div className={`preview-notice ${dataState === 'live' ? 'is-live' : ''}`}><Sparkles size={14} /><span>{dataState === 'live' && catalogProducts.length > 0 ? <><strong>Curated SaaS directory</strong> — {catalogProducts.length} sourced tools, with founder bids and rankings shown separately.</> : dataState === 'live' && liveProducts.length === 0 ? <><strong>The directory is open</strong> — approved products will appear here as they are published.</> : dataState === 'live' ? <><strong>Live directory</strong> — rankings and standing bids loaded from SaaslistAtlas.</> : dataState === 'error' ? <><strong>Directory unavailable</strong> — database setup is incomplete or unreachable.</> : dataState === 'loading' ? <><strong>Loading directory</strong> — connecting to SaaslistAtlas.</> : <><strong>Illustrative preview</strong> — sample products and bid amounts; no live bids are shown.</>}</span></div>

          <div className="filter-row">
            <div className="category-tabs" role="tablist" aria-label="Filter by category">
              {categories.map((item) => <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            <label className="select-wrap"><Filter size={14} /><select aria-label="Filter listing status" value={status} onChange={(event) => setStatus(event.target.value)}><option>All active</option><option>Top 10 only</option></select><ChevronDown size={14} /></label>
          </div>

          <section className="leaderboard-layout" aria-label="SaaS leaderboard">
            <div className="results-column">
              <div className="results-toolbar"><span>{products.length} products</span><label>Sort by <select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)}><option value="rank">Current rank</option><option value="credits">Standing bid</option><option value="name">Product name</option></select><ChevronDown size={13} /></label></div>
              <div className="table-head"><span>#</span><span>Product</span><span>Category</span><span>Standing bid</span><span>Rank movement</span><span>Action</span></div>
              {products.length ? products.map((product) => {
                const rank = rankById.get(product.id) ?? null
                return <div className="product-row" key={product.id}>
                  <span className="rank-number">{rank ? String(rank).padStart(2, '0') : '—'}</span>
                  <button className="product-identity" onClick={() => setSelected(product)} aria-label={`View ${product.name}, rank ${rank}`}><Logo product={product} /><span className="product-copy"><strong>{product.name}</strong><small>{product.tagline}</small></span></button>
                  <span className="product-category">{product.category}</span>
                  <span className="bid-value">{product.isCatalog ? <small>Directory listing</small> : product.credits > 0 ? <><strong>{product.credits}</strong> <small>credits</small></> : <small>No bid</small>}</span>
                  <span className={`movement ${product.movement > 0 ? 'up' : product.movement < 0 ? 'down' : 'steady'}`}>{product.movement > 0 ? <ArrowUpRight size={15} /> : product.movement < 0 ? <ArrowDownRight size={15} /> : <span className="movement-dash">—</span>}{product.movement ? <span>{Math.abs(product.movement)}</span> : null}</span>
                  <button className="product-boost" onClick={() => { setRankTarget(Math.min(10, Math.max(1, rank ?? 1))); setRankGuideOpen(true) }} aria-label={`Boost your listing toward rank ${Math.min(10, Math.max(1, rank ?? 1))}`}><ArrowUpRight size={14} /> Boost</button>
                </div>
              }) : <div className={`empty-state ${dataState === 'live' && liveProducts.length === 0 ? 'empty-directory' : ''}`}>
                {dataState === 'live' && liveProducts.length === 0 ? <span className="empty-emblem"><Compass size={22} /></span> : <Search size={20} />}
                <strong>{dataState === 'live' && liveProducts.length === 0 ? 'The leaderboard starts here' : 'No products found'}</strong>
                <span>{dataState === 'live' && liveProducts.length === 0 ? 'Be the first founder to introduce a product to SaaslistAtlas.' : 'Try another search or category.'}</span>
                <button onClick={() => dataState === 'live' && liveProducts.length === 0 ? setDialog('submit') : (setQuery(''), setCategory('All products'))}>{dataState === 'live' && liveProducts.length === 0 ? 'Submit the first product' : 'Clear filters'}</button>
              </div>}
              <div className="table-footer"><span>{dataState === 'preview' ? `Showing ${products.length} of 12 illustrative listings` : `${products.length} directory listings`}</span><button onClick={() => { setCategory('All products'); setQuery(''); setStatus('All active'); setSort('rank') }}>Clear filters <X size={13} /></button></div>
            </div>
            <aside className="top-ten-panel">
              <div className="top-ten-heading"><h2>Top 10</h2><div className="top-ten-actions"><button className="rank-bid-link" onClick={() => setRankGuideOpen(true)}><Target size={13} /> Bid to rank</button><button onClick={() => { setCategory('All products'); setQuery('') }}>All active <ChevronRight size={15} /></button></div></div>
              <div className="top-ten-list">{allProducts.filter((product) => {
                const rank = rankById.get(product.id)
                return rank !== null && rank !== undefined && rank <= 10
              }).filter((product) => !product.isCatalog).map((product, index) => <button key={product.id} className={`top-ten-row ${index === 0 ? 'leader' : ''}`} onClick={() => setSelected(product)}><span className="mini-rank">{String(rankById.get(product.id) ?? index + 1).padStart(2, '0')}</span><Logo product={product} small /><strong>{product.name}</strong><span className="mini-bid">{product.credits}<small> credits</small></span></button>)}{dataState === 'live' && !allProducts.some((product) => !product.isCatalog && (rankById.get(product.id) ?? 99) <= 10) && <p className="top-ten-empty">Founder-backed listings will appear here.</p>}</div>
              <div className="tie-note"><CircleHelp size={14} /><span>Equal bids keep the position earned first.</span></div>
            </aside>
          </section>

          <footer className="site-footer"><div className="footer-brand"><span className="brand-mark"><span /><span /><span /></span> Saaslist<span>Atlas</span></div><span>Find your next favorite tool.</span><div className="footer-links"><button onClick={() => setDialog('how')}>How it works</button><button onClick={() => setDialog('submit')}>Submit a product</button></div><small>© 2026 SaaslistAtlas</small></footer>
        </main>
      ) : (
        <FounderDashboard onSignIn={() => setDialog('signin')} onHow={() => setDialog('how')} />
      )}

      {selected && <ProductDialog product={selected} rank={rankById.get(selected.id) ?? null} onClose={() => setSelected(null)} onBid={() => { setSelected(null); setRankGuideOpen(true) }} preview={dataState !== 'live'} />}
      {rankGuideOpen && <RankTargetDialog
        selectedRank={rankTarget}
        onSelectRank={setRankTarget}
        rankedBids={liveProducts.filter((product) => product.currentRank !== null && product.currentRank !== undefined && product.credits > 0)}
        onClose={() => setRankGuideOpen(false)}
        onContinue={() => { setRankGuideOpen(false); setDialog('signin') }}
      />}
      {dialog && <InfoDialog type={dialog} onClose={() => setDialog(null)} onSignIn={() => setDialog('signin')} />}
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
        <div><span>Movement</span><strong className={product.movement > 0 ? 'text-green' : product.movement < 0 ? 'text-red' : ''}>{product.movement > 0 ? `↑ ${product.movement}` : product.movement < 0 ? `↓ ${Math.abs(product.movement)}` : '—'}</strong></div>
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

function RankTargetDialog({ selectedRank, onSelectRank, rankedBids, onClose, onContinue }: {
  selectedRank: number
  onSelectRank: (rank: number) => void
  rankedBids: Product[]
  onClose: () => void
  onContinue: () => void
}) {
  const ranked = [...rankedBids].sort((a, b) => (a.currentRank ?? 999) - (b.currentRank ?? 999))
  const target = rankTargetCredits[selectedRank - 1]
  const currentPosition = ranked.find((product) => product.currentRank === selectedRank)
  const targetCredits = Math.max(target.credits, currentPosition ? currentPosition.credits + 5 : 0)

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="dialog rank-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="rank-guide-title">
      <button className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      <span className="rank-guide-icon"><Target size={18} /></span>
      <span className="sample-kicker">Standing bid guide</span>
      <h2 id="rank-guide-title">Choose a rank to aim for</h2>
      <p className="rank-guide-intro">Choose a target for your own approved founder listing. The #1 guide starts at 1,770 credits and steps down by rank.</p>
      <div className="rank-target-grid" role="list" aria-label="Suggested bids by rank">
        {rankTargetCredits.map(({ rank, credits }) => {
          const current = ranked.find((product) => product.currentRank === rank)
          const amount = Math.max(credits, current ? current.credits + 5 : 0)
          return <button key={rank} role="listitem" className={`rank-target-option ${rank === selectedRank ? 'selected' : ''}`} onClick={() => onSelectRank(rank)} aria-pressed={rank === selectedRank}>
            <span>Rank <strong>#{rank}</strong></span><b>{amount.toLocaleString()}<small> cr</small></b>{current && <em>Current: {current.credits.toLocaleString()}</em>}
          </button>
        })}
      </div>
      <div className="rank-guide-summary">
        <div><span>Suggested bid for rank #{selectedRank}</span><strong>{targetCredits.toLocaleString()} <small>credits</small></strong></div>
        <p>{currentPosition ? `The current #${selectedRank} bid is ${currentPosition.credits.toLocaleString()} credits. The guide adjusts above it.` : 'Guide amount only. Your confirmed rank depends on all active bids when your bid is accepted.'}</p>
      </div>
      <div className="rank-guide-notice"><CircleHelp size={15} /><span>Live bids require an approved founder listing, account sign-in, and available credits. Directory products are not bid eligible.</span></div>
      <div className="dialog-actions rank-guide-actions"><button className="button button-light" onClick={onClose}>Close</button><button className="button button-primary" onClick={onContinue}>Continue to bid <ArrowRight size={14} /></button></div>
    </section>
  </div>
}

function InfoDialog({ type, onClose, onSignIn }: { type: 'how' | 'submit' | 'signin'; onClose: () => void; onSignIn: () => void }) {
  const titles = { how: 'How the leaderboard works', submit: 'Submit your product', signin: 'Welcome back' }
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="dialog info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title"><button className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button><span className="modal-mark">{type === 'how' ? <Trophy size={19} /> : type === 'submit' ? <Plus size={19} /> : <Compass size={19} />}</span><h2 id="info-dialog-title">{titles[type]}</h2>{type === 'how' ? <><p>Every product is ordered by its current eligible standing bid. A bid reserves credits while it remains active.</p><ol className="rules-list"><li><span>01</span><div><strong>Position follows the standing bid</strong><small>Higher bids rank above lower bids. Equal bids are ordered by when the accepted bid was recorded.</small></div></li><li><span>02</span><div><strong>Credits stay reserved</strong><small>Increasing a bid reserves only the difference. Lower-ranked listings keep their active reservations until changed or withdrawn.</small></div></li><li><span>03</span><div><strong>Every change is confirmed</strong><small>The server confirms bids and ranks. A displayed projection can change if another bid is accepted first.</small></div></li></ol><p className="detail-disclaimer">Preview data is illustrative. Live bidding is not yet enabled.</p></> : type === 'submit' ? <><p>Founders can submit a product after signing in. Each listing is reviewed before it becomes eligible for the leaderboard.</p><div className="form-note"><span className="status-dot" /> Submission review and account setup are not connected yet.</div><button className="button button-primary button-wide" onClick={onSignIn}>Continue to sign in <ArrowRight size={14} /></button></> : <><p>Live bid placement is not connected yet. Account sign-in and credit funding must be enabled before the database can accept a bid.</p><div className="auth-placeholder"><span className="auth-icon">S</span><span><strong>Bid account setup</strong><small>Authentication and credit balance are not yet available in the app.</small></span><span className="coming-soon">Coming soon</span></div><button className="button button-primary button-wide" onClick={onClose}>Close <ArrowRight size={14} /></button><small className="modal-footnote">Only an approved founder-owned listing can be bid on; sourced directory listings stay separate.</small></>}</section></div>
}

export default App
