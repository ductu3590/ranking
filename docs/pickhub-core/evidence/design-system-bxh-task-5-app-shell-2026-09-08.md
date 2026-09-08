# Evidence — Task 5, AppShell, side rail va breakpoint dieu huong

- Ngay: `2026-09-08`
- Task: AppShell, side rail, breakpoint dieu huong
- Ket luan: **PASS**

## Test viet truoc

Da mo rong:

- `tests/mobile-bottom-tabs.test.js`
- `tests/global-navigation.test.js`

Output fail truoc implementation:

```text
AssertionError [ERR_ASSERTION]: Bottom nav phai hien thi toi < 1120px vi side rail chi bat dau tu 1120px
```

## Thay doi

- `components/pickhub/SideRail.js`: dieu huong desktop theo role va route active.
- `components/pickhub/AppShell.js`: shell dung chung, role session, SideRail, MobileBottomNav va bell placeholder.
- `components/pickhub/AppShell.css`: layout responsive, side rail tu 1120px.
- `components/pickhub/PhNotificationBell.js`: placeholder `null` cho den Task 12.
- `components/MobileBottomNav.css`: breakpoint mobile toi 1119px.
- `components/HomeHeader.js`: nhan prop `trailing`, bo nav trung, chen trailing truoc UserStatusBadge.
- `app/quy/layout.js`: dung AppShell.
- `app/giai-dau/layout.js`: chi doi import va JSX sang AppShell.
- `app/admin/page.js`: bo header/bottom nav lap, boc bang AppShell.
- `app/thong-tin/page.js`: bo header/bottom nav lap, boc bang AppShell.
- `tests/mobile-bottom-tabs.test.js`: cap nhat ownership layout va active navigation sang SideRail.
- `tests/global-navigation.test.js`: them contract AppShell/SideRail va khong render header lap.

## Ket qua chay

```text
$ node tests/mobile-bottom-tabs.test.js
mobile bottom tabs contract ok

$ node tests/global-navigation.test.js
global navigation contract ok

$ node tests/ph-components.test.js
ph-components: PASS

$ node tests/ph-design-system.test.js
[ph-design-system] tham chieu token khai tu con lai: 288
ph-design-system: PASS

$ npm run build
Compiled successfully
Generating static pages (75/75)
Finalizing page optimization
```

Build co warning da ton tai ve `<img>`, eslint va dynamic server routes; khong co loi compile.

## Migration

Khong co.

## Lech so voi ke hoach

Khong co ve implementation. Cap nhat cac assertion navigation cu de phan anh ownership moi cua AppShell/SideRail, theo kien truc Task 5.

## Commit

`9f440be feat(ui): AppShell dung chung, side rail desktop, bottom nav toi 1119px`
