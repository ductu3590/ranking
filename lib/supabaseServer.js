import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client sử dụng Service Role Key
// Sử dụng cho API routes (webhook, server actions, etc.)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
}

// Fallback to anon key if service key is missing (warn only)
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY is missing. Using ANON KEY instead. Some admin actions may fail due to RLS.')
}

export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})
