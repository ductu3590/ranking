import { createElement } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getEffectiveGroupContext, getGroupIdForDatabase } from '@/lib/groupSession';
import { loadContributionInputs } from '@/lib/fundContributions';
import { buildContributionLeaderboard } from '@/lib/fundLeaderboard';

export const runtime = 'nodejs';

const PERIODS = new Set(['week', 'month', 'year', 'all']);
const PERIOD_LABELS = { week: 'Tuần này', month: 'Tháng này', year: 'Năm nay', all: 'Tất cả' };
const SHARE_CARD_INDIGO = '#6F48C9'; // --ph-indigo
const SHARE_CARD_GRADIENT_END = '#8A63E0'; // sắc sáng dùng cùng --ph-indigo
const SHARE_CARD_GOLD = '#FFC95E'; // --ph-gold
const SHARE_CARD_WHITE = '#FFFFFF'; // --ph-card
const FONT_DIR = path.join(process.cwd(), 'app/api/club/bxh/share-image');

function readFont(fileName) {
    const font = fs.readFileSync(path.join(FONT_DIR, fileName));
    return font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength);
}

function loadFonts() {
    return [
        { name: 'Montserrat', data: readFont('Montserrat-SemiBold.ttf'), weight: 600, style: 'normal' },
        { name: 'Montserrat', data: readFont('Montserrat-Bold.ttf'), weight: 700, style: 'normal' },
    ];
}

function textNode(key, text, style = {}) {
    return createElement('div', { key, style: { display: 'flex', ...style } }, text);
}

function renderShareCard(result, clubName, period) {
    const rows = result.rows.slice(0, 3);
    const topName = rows[0]?.name || 'Chưa có dữ liệu';
    const rankingNodes = rows.map((row, index) => textNode(`rank-${row.key}`, `${index + 1}. ${row.name}  ${row.amount.toLocaleString('vi-VN')}đ`, {
        color: SHARE_CARD_WHITE,
        fontSize: 24,
        fontWeight: 600,
        marginBottom: 16,
    }));

    return createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '54px 72px',
            color: SHARE_CARD_WHITE,
            fontFamily: 'Montserrat',
            backgroundImage: `linear-gradient(135deg, ${SHARE_CARD_INDIGO} 0%, ${SHARE_CARD_GRADIENT_END} 100%)`,
        },
    }, [
        textNode('brand', 'PICKHUB · BXH ĐÓNG GÓP', { color: SHARE_CARD_GOLD, fontSize: 22, fontWeight: 700, marginBottom: 22 }),
        textNode('club', clubName, { fontSize: 40, fontWeight: 700, marginBottom: 12 }),
        textNode('period', PERIOD_LABELS[period], { fontSize: 24, fontWeight: 600, opacity: 0.86, marginBottom: 20 }),
        textNode('leader', `Dẫn đầu: ${topName}`, { color: SHARE_CARD_GOLD, fontSize: 26, fontWeight: 700, marginBottom: 18 }),
        createElement('div', { key: 'ranking', style: { display: 'flex', flexDirection: 'column' } }, rankingNodes),
        createElement('div', { key: 'total', style: { display: 'flex', flexDirection: 'column', marginTop: 'auto' } }, [
            textNode('total-label', 'Tổng đóng góp', { fontSize: 22, opacity: 0.8, marginBottom: 5 }),
            textNode('total-value', `${result.summary.totalAmount.toLocaleString('vi-VN')}đ`, { fontSize: 38, fontWeight: 700 }),
        ]),
        textNode('footer', 'pickhub.vn', { color: SHARE_CARD_GOLD, fontSize: 20, fontWeight: 600, marginTop: 22 }),
    ]);
}

export async function GET(request) {
    const groupId = getGroupIdForDatabase();
    if (!groupId) return NextResponse.json({ error: 'Cần phiên CLB hợp lệ.' }, { status: 403 });
    const period = new URL(request.url).searchParams.get('period') || 'week';
    if (!PERIODS.has(period)) return NextResponse.json({ error: 'Kỳ không hợp lệ.' }, { status: 400 });

    try {
        const { transactions, members } = await loadContributionInputs(supabaseAdmin, groupId);
        const context = getEffectiveGroupContext();
        const result = buildContributionLeaderboard({ transactions, members, period });
        return new ImageResponse(renderShareCard(result, context.group_name || 'PickHub', period), {
            width: 1200,
            height: 630,
            fonts: loadFonts(),
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'private, no-store',
                'Content-Disposition': `attachment; filename="bxh-${period}.png"`,
            },
        });
    } catch (error) {
        console.error('Không tạo được ảnh BXH:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
