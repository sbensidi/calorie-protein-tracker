declare const process: { env: Record<string, string | undefined> }

export async function verifySupabaseToken(token: string): Promise<boolean> {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? '').replace(/\n/g, '')
  const supabaseKey = (process.env.VITE_SUPABASE_ANON_KEY ?? '').replace(/\n/g, '')
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
