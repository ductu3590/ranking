'use strict';
// Epic 4 · C2 — hợp đồng giao diện đăng ký giải cộng đồng (spec lat-c2-dang-ky-ghep-cap.md, D57–D59, D64).
// Đọc mã nguồn: đường dẫn API đúng, không lộ dữ liệu cá nhân ở trang công khai, không đụng Supabase từ trình duyệt,
// bố cục có cả PC (>=1024px) lẫn mobile.

const { assert, read, exists, suite } = require('../_harness');

const norm = (text) => text.replace(/\r\n?/g, '\n');
const src = (file) => (exists(file) ? norm(read(file)) : '');

const files = {
  list: 'app/cong-dong/TournamentListClient.js',
  home: 'app/cong-dong/page.js',
  publicClient: 'app/cong-dong/giai/[slug]/PublicTournamentClient.js',
  registerClient: 'app/cong-dong/giai/[slug]/dang-ky/RegisterClient.js',
  myClient: 'app/cong-dong/don-cua-toi/MyRegistrationsClient.js',
  partnerClient: 'app/cong-dong/don-cua-toi/[id]/ghep/PartnerClient.js',
  joinClient: 'app/cong-dong/ghep/[token]/JoinLinkClient.js',
  adminShell: 'app/cong-dong/quan-tri/AdminShell.js',
  adminList: 'app/cong-dong/quan-tri/AdminTournamentsClient.js',
  adminRegs: 'app/cong-dong/quan-tri/giai/[id]/dang-ky/AdminRegistrationsClient.js',
};
const code = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, src(file)]));
const css = src('app/cong-dong/community-c2.css');
const layout = src('app/cong-dong/layout.js');

suite('C2 giao diện: đủ trang', {
  'mọi trang và client component tồn tại': () => {
    for (const [key, file] of Object.entries(files)) assert.ok(code[key], `thiếu ${file}`);
    for (const page of ['giai/[slug]/page.js', 'giai/[slug]/dang-ky/page.js', 'don-cua-toi/page.js', 'don-cua-toi/[id]/ghep/page.js',
      'ghep/[token]/page.js', 'quan-tri/giai/[id]/dang-ky/page.js']) {
      assert.ok(exists(`app/cong-dong/${page}`), `thiếu trang ${page}`);
    }
  },
  'layout nạp CSS C2 và không dùng khung CLB': () => {
    assert.ok(/community-c2\.css/.test(layout));
    assert.ok(!/AppShell/.test(layout));
  },
  'không có mã Supabase ở phía giao diện cộng đồng': () => {
    for (const [key, text] of Object.entries(code)) assert.ok(!/supabase/i.test(text), `${files[key]} nhắc tới supabase`);
  },
});

suite('C2 giao diện: công khai không lộ dữ liệu cá nhân (D57)', {
  'trang công khai chỉ gọi API pairs công khai': () => {
    assert.ok(/public\/community\/\$\{encodeURIComponent\(slug\)\}\/pairs/.test(code.publicClient));
    assert.ok(!/community\/admin|community\/my/.test(code.publicClient));
  },
  'trang công khai không render SĐT, ngày sinh, đơn chờ': () => {
    assert.ok(!/\.phone|phoneNumber|birthDate|dateOfBirth|waiting|pendingList/i.test(code.publicClient), 'trang công khai chạm dữ liệu cá nhân');
    assert.ok(/pairLabel|seatNames/.test(code.publicClient), 'phải hiển thị tên cặp');
    assert.ok(/cặp đã duyệt/.test(code.publicClient), 'bộ đếm X/Y cặp đã duyệt');
  },
  'trang công khai hiện giờ bắt đầu khi có': () => {
    assert.ok(/tournament\.startTime/.test(code.publicClient));
  },
});

suite('C2 giao diện: người chơi', {
  'đăng ký gọi đúng API và cần phiên VĐV': () => {
    assert.ok(/'\/api\/tournament-v2\/community\/registrations'/.test(code.registerClient));
    assert.ok(/'\/api\/player\/session'/.test(code.registerClient));
    assert.ok(/401/.test(code.registerClient) && /\/cong-dong\/tai-khoan/.test(code.registerClient), '401 → đăng nhập, quay lại bằng next');
    assert.ok(/Tôi đã có bạn ghép/.test(code.registerClient) && /Tôi cần tìm bạn ghép/.test(code.registerClient));
  },
  'đăng ký có honeypot ẩn': () => {
    assert.ok(/name="company"|company/.test(code.registerClient) && /aria-hidden="true"/.test(code.registerClient) && /tabIndex=\{-1\}/.test(code.registerClient));
  },
  'đơn của tôi: rút đơn và trả lời lời mời': () => {
    assert.ok(/community\/my/.test(code.myClient) && /withdraw/.test(code.myClient) && /community\/invites\//.test(code.myClient));
    assert.ok(/Rút đăng ký/.test(code.myClient));
  },
  'trang ghép cặp: link, mời theo SĐT, bảng tìm bạn': () => {
    for (const path of ['community/partner-link', 'community/invites', 'community/partner-board', 'community/my']) {
      assert.ok(code.partnerClient.includes(path), `thiếu ${path}`);
    }
  },
  'link ghép cặp: xem trước bằng GET, nhận bằng POST': () => {
    assert.ok(/community\/join\?token=/.test(code.joinClient));
    assert.ok(/'\/api\/tournament-v2\/community\/join'/.test(code.joinClient));
    assert.ok(/encodeURIComponent\(token\)/.test(code.joinClient));
  },
});

suite('C2 giao diện: quản trị (PC trước)', {
  'bảng duyệt gọi API admin và có đủ thao tác': () => {
    assert.ok(/community\/admin\/registrations\?divisionId=/.test(code.adminRegs));
    assert.ok(/community\/admin\/registrations\/\$\{row\.id\}/.test(code.adminRegs));
    for (const label of ['Duyệt', 'Từ chối', 'Bỏ duyệt', 'Đánh dấu đã thu', 'Ghép hộ hai người đã chọn', 'Chọn tất cả']) {
      assert.ok(code.adminRegs.includes(label), `thiếu "${label}"`);
    }
    assert.ok(/feeState/.test(code.adminRegs) || /Đã xác nhận thu/.test(read('lib/tournament/communityRegistration.js')), 'nhãn lệ phí lấy từ domain');
  },
  'danh sách giải quản trị dùng route admin riêng': () => {
    assert.ok(/community\/admin\/tournaments/.test(code.adminList));
    assert.ok(!/api\/tournaments['`?]/.test(code.adminList), 'không dùng route CLB');
  },
  'khung quản trị có điều hướng': () => {
    assert.ok(/Giải cộng đồng/.test(code.adminShell) && /Đăng xuất/.test(code.adminShell));
  },
});

suite('C2 CSS: cả mobile lẫn PC (D64)', {
  'có breakpoint PC và mobile': () => {
    assert.ok(css, 'thiếu community-c2.css');
    assert.ok(/@media \(min-width: 1024px\)/.test(css), 'thiếu bố cục PC');
    assert.ok(/@media \(max-width: 719px\)/.test(css), 'thiếu bố cục mobile');
  },
  'nút chạm ≥ 44px và token brand': () => {
    assert.ok(/min-height:\s*44px/.test(css));
    assert.ok(/#7c3aed/i.test(css) || /var\(--cd-brand/.test(css));
  },
});
