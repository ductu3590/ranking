const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const parserSrc = fs.readFileSync(path.join(root, 'lib/transaction-parser.js'), 'utf8');

assert(
    !/memberName\s*=\s*normalizeText\(accountName\.substring/.test(parserSrc),
    'Parser không được ghi nội dung ngân hàng vào nguoi_nop; phải ghi "Unknown"'
);
assert(
    (parserSrc.match(/memberName\s*=\s*'Unknown'/g) || []).length >= 2,
    'Cả hai nhánh fallback (fallback_raw và no_match) phải ghi "Unknown"'
);
assert(
    /parsingMethod\s*=\s*'no_match'/.test(parserSrc),
    'Vẫn giữ parsingMethod để chẩn đoán'
);

console.log('club-notifications (parser): PASS');