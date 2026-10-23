import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)
export const supabase = supabaseConfigured ? createClient(url!, anonKey!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export type PublicLeaderboardRecord = {
  id: string
  name: string
  tagline: string
  category: string
  website_url: string
  standing_bid: number | null
  current_rank: number | null
  previous_rank: number | null
}

export type PublicCatalogProductRecord = {
  id: string
  name: string
  slug: string
  canonical_url: string
  description: string
  category: string
  subcategory: string | null
  pricing_model: string | null
  pricing_url: string | null
  pricing_verified_at: string | null
  source_provider: string
  source_url: string
  attribution_text: string
  verified_at: string
  logo_path: string | null
  logo_source_url: string | null
  logo_verified_at: string | null
  description_source_url: string | null
  description_verified_at: string | null
}
