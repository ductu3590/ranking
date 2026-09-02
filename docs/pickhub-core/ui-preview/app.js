const icons = {
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8M10 21h4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5.8M18 14c2 .5 3 2 3 4"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14M16 13h4"/><circle cx="16" cy="13" r=".7"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h17M8 16v-4M12 16V8M16 16v-6M20 16v-9"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.2 8.3-8 10-4.8-1.7-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
};

const mark = (label = 'P') => `
  <span class="club-mark" aria-hidden="true"><span>${label}</span></span>
`;

const logo = (compact = false) => `
  <span class="brand-lockup ${compact ? 'brand-lockup--compact' : ''}">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48"><path d="M14 34V14h11.8c5.8 0 9.7 3 9.7 8.1s-3.9 8.1-9.7 8.1h-5.1"/><path d="M21 22.1h4.2c1.7 0 2.8-.8 2.8-2s-1.1-2-2.8-2H21"/><circle cx="34.5" cy="34" r="4.3"/></svg>
    </span>
    <span class="brand-wordmark"><strong>PickHub</strong><small>${compact ? 'CLB mặc định' : 'Cộng đồng cùng nâng trình'}</small></span>
  </span>
`;

const header = (mode, title, subline) => `
  <header class="app-header">
    <div class="app-header__left">
      <button class="icon-button mobile-only" type="button" aria-label="Mở menu">${icons.menu}</button>
      ${logo(true)}
      <span class="header-divider"></span>
      <button class="workspace-picker" type="button" aria-label="Đổi không gian CLB">
        ${mark('S')}<span><strong>Skyline Pickleball</strong><small>${title}</small></span>${icons.chevron}
      </button>
    </div>
    <div class="app-header__right">
      <span class="header-kicker">${subline}</span>
      <button class="icon-button has-badge" type="button" aria-label="Thông báo">${icons.bell}<span>3</span></button>
      <button class="avatar" type="button" aria-label="Tài khoản">MT</button>
    </div>
  </header>
`;

const mobileNav = (active = 'BXH') => `
  <nav class="mobile-nav" aria-label="Điều hướng chính">
    ${[['Quỹ', icons.wallet], ['Thành viên', icons.users], ['BXH', icons.chart], ['Giải', icons.calendar], ['Cấu hình', icons.shield]].map(([label, icon]) => `<button class="mobile-nav__item ${label === active ? 'is-active' : ''} ${label === 'BXH' ? 'mobile-nav__item--center' : ''}" type="button">${icon}<span>${label}</span></button>`).join('')}
  </nav>
`;

const metric = ({ tone, icon, eyebrow, value, detail, trend }) => `
  <article class="metric-card metric-card--${tone}">
    <div class="metric-card__top"><span class="metric-icon">${icon}</span><span class="metric-eyebrow">${eyebrow}</span></div>
    <strong class="metric-value">${value}</strong>
    <div class="metric-card__bottom"><span>${detail}</span>${trend ? `<span class="metric-trend">${trend}</span>` : ''}</div>
  </article>
`;

function memberView() {
  return `<div class="app-shell app-shell--member">
    ${header('member', 'Không gian thành viên', 'Cập nhật 2 phút trước')}
    <div class="app-body">
      <aside class="side-rail">
        <div class="side-rail__label">CLB của tôi</div>
        <button class="side-link" type="button">${icons.wallet}<span>Quỹ CLB</span></button>
        <button class="side-link" type="button">${icons.users}<span>Thành viên</span></button>
        <button class="side-link is-active" type="button">${icons.chart}<span>BXH đóng góp</span></button>
        <button class="side-link" type="button">${icons.calendar}<span>Giải</span></button>
        <button class="side-link" type="button">${icons.shield}<span>Cấu hình</span></button>
        <div class="side-rail__spacer"></div>
        <div class="side-help"><span class="help-orb">?</span><strong>Cần hỗ trợ?</strong><small>Gửi câu hỏi cho trưởng nhóm</small></div>
      </aside>
      <main class="content-area" id="member-content">
        <div class="page-heading page-heading--split page-heading--compact">
          <div><span class="eyebrow">Skyline Pickleball · Thành viên</span><h1>Bảng xếp hạng đóng góp</h1><p>Minh bạch khoản quỹ, ghi nhận tinh thần và cùng nhau giữ nhịp CLB.</p></div>
          <button class="outline-button" type="button">Mã truy cập CLB <span class="access-code">SKY-482</span></button>
        </div>
        <section class="ranking-hero">
          <div class="ranking-hero__copy"><span class="ranking-kicker">BẢNG VÀNG ĐÓNG GÓP</span><div class="ranking-title-row"><span class="ranking-medal">01</span><h2>BXH nộp phạt<br><em>đóng quỹ</em></h2></div><p>Vinh danh những thành viên đóng góp nhiều nhất cho hoạt động chung của CLB.</p></div>
          <div class="ranking-period"><span>KỲ ĐANG XEM</span><strong>01/09/2026 — nay</strong><small>Được cập nhật tự động từ sổ quỹ</small></div>
        </section>
        <div class="ranking-toggle" role="tablist" aria-label="Chọn bảng xếp hạng"><button class="ranking-toggle__item is-active" type="button" role="tab" aria-selected="true">Nộp phạt</button><button class="ranking-toggle__item" type="button" role="tab" aria-selected="false">Đóng quỹ</button></div>
        <section class="summary-grid">
          <article class="summary-card"><span class="summary-card__icon summary-card__icon--coral">${icons.wallet}</span><div><small>Tổng tiền phạt</small><strong>70.000đ</strong></div></article>
          <article class="summary-card"><span class="summary-card__icon summary-card__icon--purple">${icons.users}</span><div><small>Thành viên góp quỹ</small><strong>3 người</strong></div></article>
          <article class="summary-card"><span class="summary-card__icon summary-card__icon--lime">${icons.chart}</span><div><small>Số lượt nộp phạt</small><strong>4 lượt</strong></div></article>
        </section>
        <section class="panel ranking-panel">
          <div class="panel-heading"><div><span class="eyebrow">Nộp phạt trong CLB</span><h3>Ai đang dẫn đầu?</h3></div><span class="tiny-label">Cập nhật 10 phút trước</span></div>
          <div class="ranking-podium"><div class="podium-card podium-card--second"><span class="podium-place">02</span><span class="podium-avatar">HN</span><strong>Hà Nguyên</strong><small>20.000đ</small></div><div class="podium-card podium-card--first"><span class="podium-crown">TOP 01</span><span class="podium-avatar">LP</span><strong>Lan Phương</strong><small>35.000đ</small></div><div class="podium-card podium-card--third"><span class="podium-place">03</span><span class="podium-avatar">TD</span><strong>Tuấn Dũng</strong><small>15.000đ</small></div></div>
          <div class="ranking-list"><div class="ranking-list__head"><span>HẠNG</span><span>THÀNH VIÊN</span><span>ĐÓNG GÓP</span></div>${[['04','Minh Trần','—'],['05','Ngọc Anh','—'],['06','Quang Vũ','—']].map(([rank, name, amount]) => `<div class="ranking-list__row"><span>${rank}</span><span><i class="ranking-list__avatar">${name.split(' ').map((part) => part[0]).slice(-2).join('')}</i><b>${name}</b></span><strong>${amount}</strong></div>`).join('')}</div>
        </section>
        <section class="dashboard-grid dashboard-grid--member member-secondary-grid">
          <article class="panel"><div class="panel-heading"><div><span class="eyebrow">Tổng quan CLB</span><h3>Quỹ đang vận hành</h3></div><button class="text-button" type="button">Mở sổ quỹ ${icons.arrow}</button></div><div class="fund-balance"><strong>18,4 tr</strong><span>Số dư hiện tại</span></div><div class="fund-progress"><i style="width:72%"></i></div><div class="fund-breakdown"><span><i class="legend-dot legend-dot--lime"></i> Thu tháng này <b>+2,6 tr</b></span><span><i class="legend-dot legend-dot--coral"></i> Chi tháng này <b>1,1 tr</b></span></div></article>
          <article class="panel"><div class="panel-heading"><div><span class="eyebrow">32 thành viên</span><h3>Phân bổ trình độ</h3></div><span class="tiny-label">PHR snapshot</span></div><div class="compact-distribution">${[['Mới bắt đầu', 6, 'neutral'], ['Cơ bản', 10, 'cyan'], ['Trung bình', 14, 'indigo'], ['Khá trở lên', 8, 'lime']].map(([label, count, tone]) => `<div><span>${label}</span><i><b class="meter-${tone}" style="width:${Math.round(count / 14 * 100)}%"></b></i><strong>${count}</strong></div>`).join('')}</div></article>
        </section>
      </main>
    </div>
    ${mobileNav('BXH')}
  </div>`;
}

function leaderView() {
  return `<div class="app-shell app-shell--leader">
    ${header('leader', 'Quản trị CLB', 'Chỉ trưởng nhóm mới chỉnh sửa được')}
    <div class="app-body">
      <aside class="side-rail side-rail--leader">
        <div class="side-rail__label">Quản trị CLB</div>
        <button class="side-link is-active" type="button">${icons.chart}<span>Tổng quan</span></button>
        <button class="side-link" type="button">${icons.wallet}<span>Thu–chi quỹ</span><span class="side-link__badge">2</span></button>
        <button class="side-link" type="button">${icons.users}<span>Thành viên</span></button>
        <button class="side-link" type="button">${icons.calendar}<span>Giải đấu</span></button>
        <button class="side-link" type="button">${icons.shield}<span>Cấu hình CLB</span></button>
        <div class="side-rail__spacer"></div>
        <div class="admin-pass"><span class="eyebrow">Quyền hiện tại</span><strong>Trưởng nhóm</strong><small>Đăng nhập bằng mã CLB</small></div>
      </aside>
      <main class="content-area" id="leader-content">
        <div class="page-heading page-heading--split"><div><span class="eyebrow">Bảng điều hành</span><h1>Chào anh Minh.</h1><p>Ba việc quan trọng nhất của CLB đang ở đây.</p></div><button class="primary-button" type="button">${icons.plus} Ghi giao dịch</button></div>
        <section class="leader-summary">
          <div class="leader-summary__intro"><span class="eyebrow eyebrow--light">Skyline Pickleball</span><h2>Nhịp CLB hôm nay</h2><p>Không có xung đột cần xử lý. Dữ liệu gần nhất vừa được đồng bộ.</p><span class="sync-status"><i></i> Đồng bộ ổn định</span></div>
          <div class="leader-summary__stat"><span>Số dư quỹ</span><strong>18.420.000<span>đ</span></strong><small>+2.600.000đ tháng này</small></div>
          <div class="leader-summary__stat"><span>Thành viên</span><strong>32</strong><small>2 hồ sơ cần cập nhật</small></div>
        </section>
        <div class="section-heading"><div><span class="eyebrow">Vận hành CLB</span><h2>Việc cần xử lý</h2></div><span class="tiny-label">3 mục mới</span></div>
        <section class="action-grid">
          <article class="action-card action-card--urgent"><div class="action-card__icon">${icons.users}</div><div class="action-card__body"><span class="action-card__tag">Cần chú ý</span><h3>Cập nhật 2 hồ sơ trình độ</h3><p>Hai thành viên chưa có điểm PHR để đăng ký giải.</p><button class="text-button" type="button">Mở danh sách ${icons.arrow}</button></div></article>
          <article class="action-card"><div class="action-card__icon">${icons.calendar}</div><div class="action-card__body"><span class="action-card__tag">Giải đấu</span><h3>Skyline Open đang mở đăng ký</h3><p>12 VĐV đã đăng ký · còn 6 ngày trước khi khóa.</p><button class="text-button" type="button">Quản lý đăng ký ${icons.arrow}</button></div></article>
          <article class="action-card"><div class="action-card__icon">${icons.wallet}</div><div class="action-card__body"><span class="action-card__tag">Thu–chi</span><h3>Ghi nhận khoản chi sân tháng 9</h3><p>Khoản chi dự kiến 1.200.000đ đang chờ cập nhật.</p><button class="text-button" type="button">Mở sổ quỹ ${icons.arrow}</button></div></article>
        </section>
        <section class="dashboard-grid dashboard-grid--leader">
          <article class="panel"><div class="panel-heading"><div><span class="eyebrow">Tháng 09/2026</span><h3>Dòng tiền quỹ</h3></div><button class="icon-button" type="button" aria-label="Mở báo cáo">${icons.external}</button></div><div class="cashflow-chart"><div class="chart-y"><span>20tr</span><span>10tr</span><span>0</span></div><div class="chart-bars">${[38, 54, 42, 72, 58, 82, 66].map((height, index) => `<div class="chart-bar-group"><div class="chart-bar" style="height:${height}%"><i></i></div><span>T${index + 1}</span></div>`).join('')}</div></div><div class="chart-legend"><span><i class="legend-dot legend-dot--lime"></i> Thu</span><span><i class="legend-dot legend-dot--coral"></i> Chi</span><strong>+2.600.000đ</strong></div></article>
          <article class="panel"><div class="panel-heading"><div><span class="eyebrow">Hoạt động gần đây</span><h3>Nhật ký CLB</h3></div><button class="text-button" type="button">Xem tất cả ${icons.arrow}</button></div><div class="activity-list"><div><span class="activity-avatar">MT</span><p><strong>Minh Trần</strong> ghi nhận khoản thu tháng 9<small>12 phút trước</small></p><b>+3.200.000đ</b></div><div><span class="activity-avatar activity-avatar--cyan">HN</span><p><strong>Hà Nguyên</strong> được cập nhật PHR<small>Hôm qua, 16:40</small></p><b>Khá · 3,2</b></div><div><span class="activity-avatar activity-avatar--coral">LP</span><p><strong>Lan Phương</strong> tham gia Skyline Open<small>Hôm qua, 10:15</small></p><b>Đã đăng ký</b></div></div></article>
        </section>
      </main>
    </div>
    ${mobileNav('Quỹ')}
  </div>`;
}

const publicTabs = ['Tổng quan', 'Lịch thi đấu', 'Bảng đấu', 'Kết quả'];

function publicView() {
  return `<div class="public-shell">
    <header class="public-nav"><div class="public-nav__brand">${logo()}<span class="public-nav__divider"></span><span class="public-event-label">Giải công khai</span></div><div class="public-nav__actions"><button class="ghost-button" type="button">${icons.external} Chia sẻ giải</button><button class="avatar avatar--public" type="button" aria-label="Ban tổ chức">BTC</button></div></header>
    <main>
      <section class="tournament-hero"><div class="hero-overlay"></div><div class="tournament-hero__content"><div class="event-kicker"><span class="live-pill"><i></i> ĐANG DIỄN RA</span><span>09–10 THÁNG 09, 2026</span></div><h1>PickHub<br><em>Community Open</em></h1><p>Giải giao hữu kết nối các CLB — nơi mỗi trận đấu là một bước tiến.</p><div class="event-meta"><span>${icons.calendar} Nhà thi đấu tỉnh</span><span>${icons.users} 6 CLB · 48 VĐV</span><span>${icons.shield} BTC PickHub</span></div></div><div class="tournament-hero__badge"><span class="badge-kicker">Nội dung đang diễn ra</span><strong>Đôi nam nữ</strong><small>Vòng bảng · Bảng A</small><div class="hero-score"><b>SKY 1</b><span>—</span><b>RIV 0</b></div><span class="hero-court">Sân 03 · Trận 12</span></div></section>
      <section class="public-content"><div class="public-tabs" role="tablist" aria-label="Nội dung giải đấu">${publicTabs.map((tab, index) => `<button class="public-tab ${index === 0 ? 'is-active' : ''}" data-tab="${tab}" type="button" role="tab" aria-selected="${index === 0}">${tab}</button>`).join('')}</div>
        <div class="public-grid"><article class="panel public-panel public-panel--match"><div class="panel-heading"><div><span class="eyebrow">Đang diễn ra</span><h2>Trận tiếp theo</h2></div><span class="court-chip">Sân 03</span></div><div class="match-time"><strong>14:30</strong><span>Vòng bảng · Bảng A · Trận 12</span></div><div class="match-teams"><div class="team team--home"><span class="team-badge team-badge--sky">SKY</span><strong>Skyline Aces</strong><small>Minh & Hà</small></div><div class="match-vs"><span>VS</span><small>PHR 3,0</small></div><div class="team team--away"><span class="team-badge team-badge--river">RIV</span><strong>River Smash</strong><small>Long & An</small></div></div><div class="match-status"><span><i class="live-dot"></i> Sân đang chuẩn bị</span><button class="text-button" type="button">Xem bảng điểm ${icons.arrow}</button></div></article>
          <article class="panel public-panel"><div class="panel-heading"><div><span class="eyebrow">Vòng bảng · Bảng A</span><h2>Bảng xếp hạng</h2></div><button class="text-button" type="button">Chi tiết ${icons.arrow}</button></div><div class="standings-table"><div class="standings-row standings-row--head"><span>#</span><span>Cặp đấu</span><span>W</span><span>+/-</span><span>PHR</span></div>${[['01','Skyline Aces','4','+18','3,1','team-badge--sky'],['02','River Smash','3','+09','3,0','team-badge--river'],['03','North Point','2','-02','2,8','team-badge--north'],['04','Lime Rally','1','-25','2,5','team-badge--lime']].map(([rank, name, win, diff, phr, tone]) => `<div class="standings-row"><span class="rank rank--${rank === '01' ? 'top' : 'normal'}">${rank}</span><span class="standing-team"><i class="mini-team ${tone}"></i>${name}</span><strong>${win}</strong><span class="diff ${diff.startsWith('+') ? 'is-positive' : ''}">${diff}</span><span class="phr-pill">${phr}</span></div>`).join('')}</div></article>
          <article class="panel public-panel public-panel--bracket"><div class="panel-heading"><div><span class="eyebrow">Sau vòng bảng</span><h2>Nhánh thắng / nhánh thua</h2></div><span class="tiny-label">Double elimination</span></div><div class="bracket-scroll"><div class="bracket"><div class="bracket-col"><span class="bracket-label">Tứ kết · 15 điểm</span><div class="bracket-match"><span><b>Skyline Aces</b><strong>15</strong></span><span><b>Lime Rally</b><strong>09</strong></span></div><div class="bracket-match"><span><b>River Smash</b><strong>15</strong></span><span><b>North Point</b><strong>12</strong></span></div></div><div class="bracket-connector"></div><div class="bracket-col"><span class="bracket-label">Bán kết</span><div class="bracket-match bracket-match--pending"><span><b>Skyline Aces</b><strong>—</strong></span><span><b>River Smash</b><strong>—</strong></span></div><div class="bracket-match bracket-match--muted"><span><b>Chờ nhánh thua</b><strong>—</strong></span><span><b>Chờ nhánh thua</b><strong>—</strong></span></div></div><div class="bracket-connector"></div><div class="bracket-col"><span class="bracket-label">Chung kết</span><div class="bracket-match bracket-match--final"><span><b>Chưa xác định</b><strong>—</strong></span><span><b>Chưa xác định</b><strong>—</strong></span></div></div></div></div></article>
        </div>
      </section>
    </main>
    <footer class="public-footer"><span>${logo(true)}</span><span>Minh bạch hơn · Kết nối hơn · Tiến bộ hơn</span><button class="text-button" type="button">Giới thiệu PickHub ${icons.arrow}</button></footer>
  </div>`;
}

const views = { member: memberView, leader: leaderView, public: publicView };
const requestedView = new URLSearchParams(window.location.search).get('view');
let currentView = views[requestedView] ? requestedView : 'member';

function setView(view) {
  currentView = view;
  document.querySelector('#preview-root').innerHTML = views[view]();
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.body.dataset.previewView = view;
}

document.addEventListener('click', (event) => {
  const contextButton = event.target.closest('[data-view]');
  if (contextButton) {
    setView(contextButton.dataset.view);
    document.querySelector('#preview-root').focus({ preventScroll: true });
    return;
  }

  const tab = event.target.closest('[data-tab]');
  if (tab) {
    document.querySelectorAll('[data-tab]').forEach((item) => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
  }
});

setView(currentView);
