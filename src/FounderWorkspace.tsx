import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Check, Compass, Plus, RefreshCw, Trophy } from 'lucide-react'
import { supabase } from './lib/supabase'

type WorkspacePayload = {
  account: {
    id: string
    display_name: string | null
    plan: string
    subscription_status: string
    subscription_valid_until: string | null
    grace_period_ends_at: string | null
    email_verified_at: string | null
    is_admin: boolean
    referral_code: string
  } | null
  wallet: { available: number; reserved: number; purchased_total: number; earned_total: number; spent_total: number } | null
  products: Array<{
    id: string; name: string; tagline: string; description: string; category: string; website_url: string
    state: string; current_rank: number | null; previous_rank: number | null
    standing_bid: number | null; bid_state: string | null; last_withdrawn_at: string | null; created_at: string
  }>
  ledger: Array<{ id: string; source_type: string; credit_amount: number; available_delta: number; reserved_delta: number; reason: string; created_at: string }>
  referrals: Array<{ id: string; state: string; reward_credits: number | null; attribution_at: string; created_at: string }>
}

type Props = { userId: string; email: string; onSignOut: () => void; onHow: () => void }

const emptyPayload: WorkspacePayload = { account: null, wallet: null, products: [], ledger: [], referrals: [] }

function subscriptionEligible(account: WorkspacePayload['account']) {
  if (!account) return false
  const now = Date.now()
  const valid = account.subscription_valid_until ? new Date(account.subscription_valid_until).getTime() > now : true
  const grace = account.grace_period_ends_at ? new Date(account.grace_period_ends_at).getTime() > now : false
  if (account.subscription_status === 'active' || account.subscription_status === 'trialing') return valid
  if (account.subscription_status === 'cancelled') return Boolean(account.subscription_valid_until && valid)
  if (account.subscription_status === 'past_due') return grace
  return false
}

function prettyStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function FounderWorkspace({ userId, email, onSignOut, onHow }: Props) {
  const [tab, setTab] = useState('Your products')
  const [workspace, setWorkspace] = useState<WorkspacePayload>(emptyPayload)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [bidAmounts, setBidAmounts] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ name: '', tagline: '', description: '', category: 'AI', website: '' })

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase.rpc('get_founder_workspace')
    if (loadError) {
      setError(loadError.message.includes('get_founder_workspace')
        ? 'The founder workspace database migration is not installed yet. Apply the latest SaaslistAtlas Supabase migration, then refresh.'
        : loadError.message)
    } else {
      setWorkspace({ ...emptyPayload, ...(data as Partial<WorkspacePayload>) })
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load, userId])

  const account = workspace.account
  const wallet = workspace.wallet
  const eligible = subscriptionEligible(account)
  const activeBidCount = useMemo(() => workspace.products.filter((product) => product.bid_state === 'active').length, [workspace.products])

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const website = form.website.trim()
      const validUrl = new URL(website)
      if (validUrl.protocol !== 'https:') throw new Error('Enter an official website URL beginning with https://.')
      const { error: createError } = await supabase.rpc('create_product_listing', {
        p_name: form.name.trim(),
        p_tagline: form.tagline.trim(),
        p_description: form.description.trim(),
        p_category: form.category,
        p_website_url: validUrl.toString(),
      })
      if (createError) throw createError
      setForm({ name: '', tagline: '', description: '', category: 'AI', website: '' })
      setShowForm(false)
      setNotice('Your product was submitted for review. It will appear on the founder leaderboard only after approval and when eligible.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit this product.')
    } finally {
      setSaving(false)
    }
  }

  async function changeBid(productId: string, withdraw = false) {
    if (!supabase) return
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const key = crypto.randomUUID()
      const result = withdraw
        ? await supabase.rpc('withdraw_standing_bid', { p_product_id: productId, p_idempotency_key: key })
        : await supabase.rpc('place_or_update_bid', { p_product_id: productId, p_amount: Number(bidAmounts[productId]), p_idempotency_key: key })
      if (result.error) throw result.error
      setNotice(withdraw ? 'Standing bid withdrawn and its reservation released.' : 'Standing bid accepted. Credits reserved and rank recalculated.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this standing bid.')
    } finally {
      setSaving(false)
    }
  }

  return <main className="founder-page">
    <div className="founder-title">
      <div><p className="founder-breadcrumb">Founder workspace <ArrowRight size={13} /> Overview</p><h1>Your founder workspace</h1><p className="founder-intro">Manage your products, credit reservations, and ranking.</p></div>
      <div className="workspace-account"><span>{email}</span><button className="button button-light" onClick={onSignOut}>Sign out</button></div>
    </div>
    {error && <div className="workspace-alert error" role="alert">{error}<button onClick={() => void load()} aria-label="Retry loading"><RefreshCw size={14} /></button></div>}
    {notice && <div className="workspace-alert success" role="status"><Check size={15} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
    {!eligible && account && <div className="workspace-alert neutral"><strong>Plan required for listings and bidding.</strong><span>Your current subscription status is {prettyStatus(account.subscription_status)}. Billing is not enabled yet, so these actions remain protected until a valid subscription exists.</span></div>}
    {loading ? <div className="workspace-empty"><span className="empty-emblem"><RefreshCw size={20} /></span><h3>Loading your workspace</h3><p>Reading your account and credit activity securely.</p></div> : <>
      <div className="balance-grid">
        <section className="balance-card"><span>Available credits</span><strong>{wallet ? wallet.available.toLocaleString() : '—'}</strong><small>Ready for an eligible standing bid</small></section>
        <section className="balance-card"><span>Reserved for bids</span><strong>{wallet ? wallet.reserved.toLocaleString() : '—'}</strong><small>Reservations stay active until changed or withdrawn</small></section>
        <section className="balance-card"><span>Your active bids</span><strong>{activeBidCount}</strong><small>Across approved founder listings</small></section>
      </div>
      <div className="workspace-tabs">{['Your products', 'Credit activity', 'Referrals'].map((item) => <button key={item} className={tab === item ? 'current' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>
      {tab === 'Your products' ? <section className="workspace-section">
        <div className="section-header"><div><h2>Your listings</h2><p>Only approved and eligible founder-owned products can participate in bidding.</p></div><button className="button button-dark" onClick={() => { setShowForm(!showForm); setError(''); setNotice('') }} disabled={!eligible}><Plus size={15} /> Add a product</button></div>
        {showForm && <form className="listing-form" onSubmit={submitProduct}>
          <label>Product name<input required minLength={2} maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Short tagline<input required minLength={5} maxLength={180} value={form.tagline} onChange={(event) => setForm({ ...form, tagline: event.target.value })} /></label>
          <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{['AI', 'Analytics', 'Design', 'Developer tools', 'Marketing', 'Productivity', 'Finance', 'Customer support', 'Security', 'Other'].map((category) => <option key={category}>{category}</option>)}</select></label>
          <label>Official HTTPS website<input required type="url" inputMode="url" placeholder="https://example.com" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} /></label>
          <label className="listing-description">Description<textarea maxLength={5000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="listing-form-actions"><button type="button" className="button button-light" onClick={() => setShowForm(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit for review'} <ArrowRight size={14} /></button></div>
          <p className="listing-form-note">The server validates ownership, subscription eligibility, and plan listing limits.</p>
        </form>}
        {workspace.products.length ? <div className="founder-products">{workspace.products.map((product) => <article className="founder-product-card" key={product.id}>
          <div className="founder-product-main"><div><h3>{product.name}</h3><p>{product.tagline}</p><small>{product.category} · <a href={product.website_url} target="_blank" rel="noreferrer">{new URL(product.website_url).hostname}</a></small></div><span className={'state-pill state-' + product.state}>{prettyStatus(product.state)}</span></div>
          <div className="founder-product-metrics"><span>Rank <strong>{product.current_rank ? '#' + product.current_rank : '—'}</strong></span><span>Standing bid <strong>{product.standing_bid ? product.standing_bid.toLocaleString() + ' credits' : 'No active bid'}</strong></span></div>
          {product.state === 'approved' && eligible && <div className="bid-editor"><label>New standing bid (credits)<input type="number" min="1" step="1" value={bidAmounts[product.id] ?? (product.standing_bid ? String(product.standing_bid) : '')} onChange={(event) => setBidAmounts({ ...bidAmounts, [product.id]: event.target.value })} placeholder="Enter integer credits" /></label><button className="button button-primary" disabled={saving || !bidAmounts[product.id] || !Number.isSafeInteger(Number(bidAmounts[product.id])) || Number(bidAmounts[product.id]) <= 0} onClick={() => void changeBid(product.id)}>{product.standing_bid ? 'Update bid' : 'Place bid'}</button>{product.bid_state === 'active' && <button className="button button-light" disabled={saving} onClick={() => void changeBid(product.id, true)}>Withdraw</button>}</div>}
        </article>)}</div> : <div className="workspace-empty"><span className="empty-emblem"><Compass size={22} /></span><h3>Your workspace starts here</h3><p>Your submissions, moderation status, and eligible standing bids will appear here.</p>{eligible && <button className="button button-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Submit your first product</button>}</div>}
      </section> : tab === 'Credit activity' ? <section className="workspace-section"><div className="section-header"><div><h2>Credit activity</h2><p>Recent ledger movements for your account.</p></div></div>{workspace.ledger.length ? <div className="ledger-list">{workspace.ledger.map((entry) => <article className="ledger-row" key={entry.id}><div><strong>{entry.reason}</strong><small>{prettyStatus(entry.source_type)} · {new Date(entry.created_at).toLocaleString()}</small></div><span className={entry.available_delta + entry.reserved_delta >= 0 ? '' : 'negative'}>{entry.available_delta > 0 ? '+' : ''}{entry.available_delta} available · {entry.reserved_delta > 0 ? '+' : ''}{entry.reserved_delta} reserved</span></article>)}</div> : <div className="workspace-empty compact"><h3>No credit movements yet</h3><p>Credit activity appears here after a verified credit event.</p></div>}</section> : <section className="workspace-section"><div className="section-header"><div><h2>Referrals</h2><p>Share your code with founders. Rewards are recorded only after qualification.</p></div></div><div className="referral-code"><span>Your referral code</span><strong>{account?.referral_code ?? '—'}</strong><button className="button button-light" onClick={async () => { if (account?.referral_code) await navigator.clipboard.writeText(account.referral_code); setNotice('Referral code copied.') }}>Copy code</button></div>{workspace.referrals.length ? <div className="ledger-list">{workspace.referrals.map((item) => <article className="ledger-row" key={item.id}><div><strong>{prettyStatus(item.state)}</strong><small>Started {new Date(item.attribution_at).toLocaleDateString()}</small></div><span>{item.reward_credits ? item.reward_credits.toLocaleString() + ' credits' : 'Not rewarded'}</span></article>)}</div> : <div className="workspace-empty compact"><h3>No referrals yet</h3><p>Your referred founders will be listed here after attribution.</p></div>}</section>}
    </>}
    <div className="reservation-explainer"><div className="reservation-icon"><Check size={17} /></div><div><strong>Your bid is a reservation, not a purchase.</strong><span>Credits remain reserved while a standing bid is active. When you lower or withdraw a bid, the released amount returns to available credits after the database commits.</span></div><button onClick={onHow}>Read the rules <ArrowRight size={14} /></button></div>
  </main>
}
