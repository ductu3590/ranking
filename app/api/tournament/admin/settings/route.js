import { supabaseServer } from '@/lib/supabaseServer';
import { getGroupIdForDatabase, requireGroupAdmin } from '@/lib/groupSession';
import { NextResponse } from 'next/server';

const SETTING_KEYS = [
    'round1_reveal_time',
    'start_time',
    'end_time',
    'total_courts',
    'match_duration_minutes',
    'break_duration_minutes',
];

function readTournamentId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(request) {
    try {
        const groupId = getGroupIdForDatabase();
        const tournamentId = readTournamentId(new URL(request.url).searchParams.get('tournamentId'));
        if (!tournamentId) {
            return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
        }
        const { data, error } = await supabaseServer
            .from('tournament_settings')
            .select('setting_key, setting_value')
            .eq('group_id', groupId)
            .eq('tournament_id', tournamentId)
            .in('setting_key', SETTING_KEYS);
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        const settings = {};
        for (const row of data || []) settings[row.setting_key] = row.setting_value;
        return NextResponse.json({ settings });
    } catch (err) {
        console.error('Settings GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = getGroupIdForDatabase();
        const body = await request.json();
        const tournamentId = readTournamentId(body?.tournamentId);
        if (!tournamentId) {
            return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
        }
        const rows = SETTING_KEYS
            .filter((key) => key in body)
            .map((key) => ({
                group_id: groupId,
                tournament_id: tournamentId,
                setting_key: key,
                setting_value: body[key] ?? null,
                updated_at: new Date().toISOString(),
            }));
        if (rows.length > 0) {
            const { error } = await supabaseServer
                .from('tournament_settings')
                .upsert(rows, { onConflict: 'group_id,tournament_id,setting_key' });
            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        }
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Settings POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
