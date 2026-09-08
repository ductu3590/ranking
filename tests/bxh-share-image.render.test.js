const fs = require('fs');
const path = require('path');
const assert = require('assert');

const fontDir = path.resolve(__dirname, '..', 'app/api/club/bxh/share-image');

function readCmap(fileName) {
    const buffer = fs.readFileSync(path.join(fontDir, fileName));
    const tables = buffer.readUInt16BE(4);
    let cmapOffset = 0;
    for (let index = 0; index < tables; index += 1) {
        const record = 12 + index * 16;
        if (buffer.toString('ascii', record, record + 4) === 'cmap') cmapOffset = buffer.readUInt32BE(record + 8);
    }
    assert(cmapOffset, `${fileName} phải có cmap`);
    const records = buffer.readUInt16BE(cmapOffset + 2);
    for (let index = 0; index < records; index += 1) {
        const record = cmapOffset + 4 + index * 8;
        const offset = cmapOffset + buffer.readUInt32BE(record + 4);
        const format = buffer.readUInt16BE(offset);
        if (format === 12) {
            const groups = buffer.readUInt32BE(offset + 12);
            const covered = new Set();
            for (let group = 0; group < groups; group += 1) {
                const cursor = offset + 16 + group * 12;
                for (let code = buffer.readUInt32BE(cursor); code <= buffer.readUInt32BE(cursor + 4); code += 1) covered.add(code);
            }
            return covered;
        }
        if (format === 4) {
            const segments = buffer.readUInt16BE(offset + 6) / 2;
            const endCodes = offset + 14;
            const startCodes = endCodes + segments * 2 + 2;
            const covered = new Set();
            for (let segment = 0; segment < segments; segment += 1) {
                const start = buffer.readUInt16BE(startCodes + segment * 2);
                const end = buffer.readUInt16BE(endCodes + segment * 2);
                for (let code = start; code <= end; code += 1) covered.add(code);
            }
            return covered;
        }
    }
    throw new Error(`${fileName} không có cmap format 4/12`);
}

for (const fontName of ['Montserrat-SemiBold.ttf', 'Montserrat-Bold.ttf']) {
    const cmap = readCmap(fontName);
    for (const character of 'VŨ NGỌC HƯNG ĐẶNG TIẾN ANH') {
        assert(cmap.has(character.codePointAt(0)), `${fontName} thiếu glyph tiếng Việt ${character}`);
    }
}

console.log('bxh-share-image Vietnamese glyph coverage: PASS');
