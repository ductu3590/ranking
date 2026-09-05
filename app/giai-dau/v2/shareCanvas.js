// Chuyển ảnh chia sẻ (SVG dựng từ public projection) thành PNG ngay trên máy
// người dùng rồi tải về. Render bằng canvas của trình duyệt nên chữ tiếng Việt
// luôn đúng dấu và không cần font server.
//
// SVG được nhúng dưới dạng data URL (same-origin) nên canvas không bị "tainted";
// vì thế ảnh xuất chỉ được chứa dữ liệu nội tuyến, không tham chiếu ảnh ngoài.

export function svgToDataUrl(svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Không dựng được ảnh từ dữ liệu giải.'));
        image.src = src;
    });
}

function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        if (typeof canvas.toBlob === 'function') {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Không tạo được ảnh PNG.'));
            }, 'image/png');
            return;
        }
        try {
            const dataUrl = canvas.toDataURL('image/png');
            const binary = atob(dataUrl.split(',')[1]);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
            resolve(new Blob([bytes], { type: 'image/png' }));
        } catch (error) {
            reject(error);
        }
    });
}

export async function renderSvgToPngBlob({ svg, width, height, scale = 1 }) {
    const image = await loadImage(svgToDataUrl(svg));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b1f17';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas);
}

export async function downloadShareImage({ svg, width, height, filename, scale = 1 }) {
    const blob = await renderSvgToPngBlob({ svg, width, height, scale });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'pickhub.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return blob;
}

export async function copyPlainText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
}
