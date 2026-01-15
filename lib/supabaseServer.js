import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client sử dụng Service Role Key
// Sử dụng cho API routes (webhook, server actions, etc.)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})
