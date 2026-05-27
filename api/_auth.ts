declare const process: { env: Record<string, string | undefined> }

async function verifyAgainst(supabaseUrl: string, supabaseKey: string, token: string): Promise<boolean> {
  if (!supabaseUrl || !supabaseKey) return false
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function verifySupabaseToken(token: string): Promise<boolean> {
  const webUrl  = (process.env.VITE_SUPABASE_URL      ?? '').replace(/\n/g, '')
  const webKey  = (process.env.VITE_SUPABASE_ANON_KEY ?? '').replace(/\n/g, '')
  const iosUrl  = (process.env.IOS_SUPABASE_URL        ?? '').replace(/\n/g, '')
  const iosKey  = (process.env.IOS_SUPABASE_ANON_KEY   ?? '').replace(/\n/g, '')

  // Try web project first, then iOS project
  if (await verifyAgainst(webUrl, webKey, token)) return true
  if (await verifyAgainst(iosUrl, iosKey, token)) return true
  return false
}
