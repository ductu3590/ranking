// Tiện ích thuần dùng chung cho các bước wizard tạo giải.

// Slug bỏ dấu tiếng Việt, đ→d, ký tự lạ thành '-'.
export function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

export function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function chunkPairs(list) {
    const out = [];
    for (let i = 0; i < list.length; i += 2) out.push([list[i], list[i + 1] || null]);
    return out;
}

export function splitTeams(list, count) {
    const teams = Array.from({ length: count }, () => []);
    list.forEach((name, index) => { teams[index % count].push(name); });
    return teams;
}
