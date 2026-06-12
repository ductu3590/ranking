import { supabaseServer } from '@/lib/supabaseServer';
import { DEFAULT_TOURNAMENT } from '@/lib/tournamentDefaults';

export async function getTournaments() {
    try {
        const { data, error } = await supabaseServer
            .from('tournaments')
            .select('*')
            .order('event_date', { ascending: false });

        if (error) {
            console.warn('Tournaments table unavailable, using default tournament:', error.message);
            return { tournaments: [DEFAULT_TOURNAMENT], fallback: true };
        }

        return {
            tournaments: data?.length ? data : [DEFAULT_TOURNAMENT],
            fallback: !data?.length,
        };
    } catch (err) {
        console.error('Tournaments query error:', err);
        return { tournaments: [DEFAULT_TOURNAMENT], fallback: true };
    }
}
