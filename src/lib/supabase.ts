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
