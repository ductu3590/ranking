# Evidence — Task 2, token va font Montserrat

- Ngay: `2026-09-08`
- Task: Tang token va font Montserrat
- Ket luan: **PASS**

## Test viet truoc

File: `tests/ph-design-system.test.js`

Lan chay hop le truoc implementation:

```text
Error: ENOENT: no such file or directory, open 'C:\\Users\\ductu\\ranking\\app\\styles\\tokens.css'
```

## Thay doi

- `app/styles/tokens.css`: tao nguon duy nhat cho token `--ph-*` theo UI-BRAND-SYSTEM.md.
- `app/styles/legacy-aliases.css`: tao tang alias khai tu cho code chua redesign.
- `app/styles/primitives.css`: tao placeholder cho Task 3.
- `app/globals.css`: con ba import, reset, focus ring, reduced motion va mobile safe area.
- `app/layout.js`: nap Montserrat voi cac weight 400/500/600/700/800 va bien `--ph-font-loaded`.
- `tests/ph-design-system.test.js`: them contract test token/font/legacy definitions.
- `tests/court-energy-css.test.js`: xoa test design system cu.
- `tests/mobile-bottom-tabs.test.js`: doi assertion sang token chuan `--ph-bottom-nav-height`.
- `package.json`: thay `test:court-energy-css` bang `test:ph-ui` va cap nhat regression.

## Ket qua chay

```text
$ node tests/ph-design-system.test.js
[ph-design-system] tham chieu token khai tu con lai: 288
ph-design-system: PASS

$ npm run build
Compiled successfully
Generating static pages (75/75)
Finalizing page optimization

$ npm run test:regression
phase 1 ... contract ok
phase 3 ... PASS
phase 4 ... contract ok
mobile bottom tabs contract ok
fund leaderboard logic ok
global navigation contract ok
[ph-design-system] tham chieu token khai tu con lai: 288
ph-design-system: PASS
... tournament contracts ok
open-registration domain: OK
open-registration api contract: OK
open-registration ui contract: OK
```

Regression co in stack trace `offline` trong test notifications-finance nhung test van ket luan `phase4 notifications finance contract ok`; day la hanh vi test co san.

## Migration

Khong co.

## Lech so voi ke hoach

- Khong co ve pham vi Task 2.
- Bo sung cap nhat assertion trong `tests/mobile-bottom-tabs.test.js` vi contract cu kiem tra ten token da duoc thay the; khong them alias nguoc vao CSS.
- So tham chieu token khai tu con lai sau khi tach alias: 288; preflight truoc thay doi la 301.

## Commit

`1ecdf61 feat(ui): hop nhat token ve --ph-*, nap font Montserrat, thay test court-energy`
