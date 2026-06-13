import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client sử dụng Service Role Key
// Sử dụng cho API routes (webhook, server actions, etc.)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in production');
    }
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY missing — using anon key (dev only).');
}

export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})
