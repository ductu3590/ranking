'use strict';
// Vá lỗi có sẵn (b): PhNotificationBell coi mọi thông báo là giao dịch ("…đ chưa rõ người nộp").
// Rẽ nhánh theo kind: giải đấu dùng `display` do route chiếu (projectClubNotification), có link;
// unassigned_transaction giữ nguyên hiển thị + nút "Gán cho thành viên".

const { assert, read, suite } = require('../_harness');

const bell = read('components/pickhub/PhNotificationBell.js').replace(/\r\n?/g, '\n');

suite('f1 chuông thông báo rẽ nhánh theo kind', {
  'giao dịch chưa gán: giữ nguyên câu + nút gán, chỉ cho kind unassigned_transaction'() {
    assert.ok(bell.includes("item.kind === 'unassigned_transaction'"));
    assert.ok(bell.includes('đ chưa rõ người nộp'));
    assert.ok(bell.includes('Gán cho thành viên'));
    const legacy = bell.indexOf('đ chưa rõ người nộp');
    const branch = bell.lastIndexOf("item.kind === 'unassigned_transaction'", legacy);
    assert.ok(branch >= 0 && branch < legacy, 'câu giao dịch nằm trong nhánh unassigned_transaction');
  },

  'thông báo giải đấu: tiêu đề/nội dung/link/nhãn từ item.display'() {
    assert.ok(bell.includes('item.display'));
    for (const field of ['title', 'body', 'href', 'actionLabel']) {
      assert.ok(new RegExp(`display\\??\\.${field}`).test(bell), `display.${field}`);
    }
    assert.ok(/<Link[^>]*href=\{display\.href\}/.test(bell) || /href=\{display\.href\}/.test(bell), 'có link tới lời mời / bước duyệt');
    assert.ok(bell.includes("from 'next/link'"));
  },

  'kind lạ không bị hiển thị thành giao dịch; mọi mục vẫn "Bỏ qua" được'() {
    const branches = bell.match(/Bỏ qua/g) || [];
    assert.ok(branches.length >= 2, 'nút Bỏ qua ở cả nhánh giao dịch và nhánh khác');
    assert.equal(/items\.map\(\(item\) => <div key=\{item\.id\} className="ph-notification-item">\s*<p className="ph-notification-item__amount">/.test(bell), false,
      'không còn render mọi mục thành dòng số tiền');
  },
});
