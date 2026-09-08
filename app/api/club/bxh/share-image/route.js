import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getEffectiveGroupContext, getGroupIdForDatabase } from '@/lib/groupSession';
import { loadContributionInputs } from '@/lib/fundContributions';
import { buildContributionLeaderboard } from '@/lib/fundLeaderboard';

const PERIODS = new Set(['week', 'month', 'year', 'all']);
const PERIOD_LABELS = { week: 'Tuần này', month: 'Tháng này', year: 'Năm nay', all: 'Tất cả' };
const SHARE_CARD_INDIGO = '#6F48C9'; // --ph-indigo
const SHARE_CARD_GRADIENT_END = '#8A63E0'; // sắc sáng dùng cùng --ph-indigo
const SHARE_CARD_GOLD = '#FFC95E'; // --ph-gold

function escapeXml(value) {
    return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[character]));
}

function renderShareCardSvg(result, clubName, period) {
    const rows = result.rows.slice(0, 3);
    const names = rows.map((row, index) => `<text x="96" y="${245 + index * 55}" fill="#FFFFFF" font-size="24" font-family="Montserrat, sans-serif">${index + 1}. ${escapeXml(row.name)}  ${escapeXml(`${row.amount.toLocaleString('vi-VN')}đ`)}</text>`).join('');
    const topName = rows[0]?.name || 'Chưa có dữ liệu';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="share-bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${SHARE_CARD_INDIGO}"/><stop offset="1" stop-color="${SHARE_CARD_GRADIENT_END}"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#share-bg)"/><circle cx="1040" cy="110" r="180" fill="${SHARE_CARD_GOLD}" opacity=".16"/>
<text x="72" y="82" fill="${SHARE_CARD_GOLD}" font-size="22" font-weight="700" font-family="Montserrat, sans-serif">PICKHUB · BXH ĐÓNG GÓP</text>
<text x="72" y="145" fill="#FFFFFF" font-size="40" font-weight="800" font-family="Montserrat, sans-serif">${escapeXml(clubName)}</text>
<text x="72" y="185" fill="#FFFFFF" opacity=".86" font-size="24" font-family="Montserrat, sans-serif">${escapeXml(PERIOD_LABELS[period])}</text>
<text x="72" y="225" fill="${SHARE_CARD_GOLD}" font-size="26" font-weight="700" font-family="Montserrat, sans-serif">Dẫn đầu: ${escapeXml(topName)}</text>
${names}
<text x="72" y="470" fill="#FFFFFF" opacity=".8" font-size="22" font-family="Montserrat, sans-serif">Tổng đóng góp</text>
<text x="72" y="515" fill="#FFFFFF" font-size="38" font-weight="800" font-family="Montserrat, sans-serif">${result.summary.totalAmount.toLocaleString('vi-VN')}đ</text>
<text x="72" y="580" fill="#FFFFFF" opacity=".78" font-size="20" font-family="Montserrat, sans-serif">pickhub.vn</text>
</svg>`;
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
        const svg = renderShareCardSvg(result, context.group_name || 'PickHub', period);
        return new Response(svg, {
            status: 200,
            headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'private, no-store',
                'Content-Disposition': `attachment; filename="bxh-${period}.svg"`,
            },
        });
    } catch (error) {
        console.error('Không tạo được ảnh BXH:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}