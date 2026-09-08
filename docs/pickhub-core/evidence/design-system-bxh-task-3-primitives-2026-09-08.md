# Evidence — Task 3, primitive CSS

- Ngay: `2026-09-08`
- Task: Primitive CSS
- Ket luan: **PASS**

## Test viet truoc

File: `tests/ph-design-system.test.js`

Sau khi mo rong `REQUIRED_TOKENS` va assert backdrop, lan chay truoc implementation token tint:

```text
AssertionError [ERR_ASSERTION]: tokens.css phai khai --ph-tint-indigo: #F4F2FE
```

## Thay doi

- `tests/ph-design-system.test.js`: them 13 token tint, assert `--ph-backdrop`, va guard khong hardcode hex trong CSS moi.
- `app/styles/tokens.css`: them token tint va backdrop.
- `app/styles/primitives.css`: them cac primitive ph-* cho nut, be mat, metric, badge, segmented control, bang, modal, field, state va skeleton.

## Ket qua chay

```text
$ node tests/ph-design-system.test.js
[ph-design-system] tham chieu token khai tu con lai: 288
ph-design-system: PASS

$ npm run build
Compiled successfully
Generating static pages (75/75)
Finalizing page optimization
```

Build co cac warning da ton tai ve `<img>`, eslint va dynamic server routes; khong co loi compile.

## Migration

Khong co.

## Lech so voi ke hoach

Khong co. Da dung token `--ph-*` cho moi mau trong `primitives.css`, khong hardcode mau hex.

## Commit

`6d2cbfb feat(ui): mo rong token tint, them lop primitive ph-* khong hardcode mau`
