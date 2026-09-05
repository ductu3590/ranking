// Render ảnh card Open Graph ra PNG.
//
// Vì sao phải nạp font ngoài: bộ font mặc định đi kèm `next/og` là
// `noto-sans-v27-latin` — subset Latin không có glyph tiếng Việt có dấu
// (đã kiểm tra bảng cmap: 'ế', 'ộ', 'đ' đều thiếu). Nếu dùng font mặc định thì
// tên giải tiếng Việt sẽ ra ô vuông. Font được nạp một lần rồi cache trong
// module; nếu không nạp được (không có mạng) thì trả null và caller rơi về SVG.
import { createElement } from 'react';

const FONT_FAMILY = 'Be Vietnam Pro';
const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;700';

let fontsPromise = null;

async function fetchFonts() {
    const css = await fetch(FONT_CSS_URL, { cache: 'force-cache' }).then((res) => {
        if (!res.ok) throw new Error(`font css ${res.status}`);
        return res.text();
    });
    const blocks = css.split('@font-face');
    const faces = [];
    for (const block of blocks) {
        const url = block.match(/src:\s*url\((https:[^)]+\.ttf)\)/);
        const weight = block.match(/font-weight:\s*(\d+)/);
        if (!url) continue;
        faces.push({ url: url[1], weight: weight ? Number(weight[1]) : 400 });
    }
    const unique = [];
    for (const face of faces) {
        if (!unique.some((item) => item.weight === face.weight)) unique.push(face);
    }
    if (!unique.length) throw new Error('không tìm thấy font ttf');
    return Promise.all(unique.map(async (face) => ({
        name: FONT_FAMILY,
        weight: face.weight,
        style: 'normal',
        data: await fetch(face.url, { cache: 'force-cache' }).then((res) => {
            if (!res.ok) throw new Error(`font ttf ${res.status}`);
            return res.arrayBuffer();
        }),
    })));
}

async function loadFonts() {
    if (!fontsPromise) {
        fontsPromise = fetchFonts().catch((error) => {
            console.error('share card font load failed:', error.message);
            fontsPromise = null;
            return null;
        });
    }
    return fontsPromise;
}

function textNode(key, text, style) {
    return createElement('div', { key, style: { display: 'flex', ...style } }, text);
}

function cardTree(model, host) {
    const theme = model.theme;
    const children = [];
    if (host && host.logo_url) {
        children.push(createElement('img', {
            key: 'logo',
            src: host.logo_url,
            width: 96,
            height: 96,
            style: { borderRadius: 24, marginBottom: 20, objectFit: 'cover' },
        }));
    }
    children.push(textNode('title', model.title, {
        fontSize: model.title.length > 46 ? 52 : 62,
        fontWeight: 700,
        lineHeight: 1.15,
        marginBottom: 18,
    }));
    if (model.subtitle) {
        children.push(textNode('subtitle', model.subtitle, { fontSize: 30, color: theme.muted, marginBottom: 12 }));
    }
    const divisionBlock = (model.blocks || []).find((block) => block.type === 'text');
    if (divisionBlock) {
        children.push(textNode('divisions', divisionBlock.text, { fontSize: 26, color: theme.muted }));
    }
    const footerParts = [];
    if (host && host.name) footerParts.push(host.name);
    if (model.badge) footerParts.push(model.badge);
    footerParts.push('PickHub');

    return createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '56px 64px',
            backgroundColor: theme.background,
            color: theme.text,
            fontFamily: FONT_FAMILY,
        },
    }, [
        createElement('div', { key: 'body', style: { display: 'flex', flexDirection: 'column' } }, children),
        createElement('div', {
            key: 'footer',
            style: {
                display: 'flex', fontSize: 26, color: theme.accent,
                borderTop: `2px solid ${theme.line}`, paddingTop: 20,
            },
        }, footerParts.join(' · ')),
    ]);
}

/**
 * @returns {Promise<Response|null>} null khi không render được PNG (thiếu font).
 */
export async function renderCardPng(model, host) {
    try {
        const fonts = await loadFonts();
        if (!fonts || !fonts.length) return null;
        const { ImageResponse } = await import('next/og');
        return new ImageResponse(cardTree(model, host), {
            width: model.width,
            height: model.fixedHeight || model.minHeight,
            fonts,
        });
    } catch (error) {
        console.error('share card png error:', error);
        return null;
    }
}

export const SHARE_CARD_FONT_FAMILY = FONT_FAMILY;
