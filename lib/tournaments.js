import { supabaseServer } from '@/lib/supabaseServer';
import { DEFAULT_TOURNAMENT } from '@/lib/tournamentDefaults';
import { getEffectiveGroupContext, isMissingGroupColumnError } from '@/lib/groupSession';

export async function getTournaments() {
    try {
        const { group_id: groupId } = getEffectiveGroupContext();
        const { data, error } = await supabaseServer
            .from('tournaments')
            .select('*')
            .eq('group_id', groupId)
            .order('event_date', { ascending: false });

        if (error) {
            if (isMissingGroupColumnError(error)) {
                const { data: fallbackData, error: fallbackError } = await supabaseServer
                    .from('tournaments')
                    .select('*')
                    .order('event_date', { ascending: false });
                if (!fallbackError) {
                    return {
                        tournaments: fallbackData?.length ? fallbackData : [DEFAULT_TOURNAMENT],
                        fallback: !fallbackData?.length,
                    };
                }
            }
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
