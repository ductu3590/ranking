# Evidence — Task 7, chuan hoa Unknown va don ton dong

- Ngay: `2026-09-08`
- Task: Chuan hoa fallback parser va backfill nguoi_nop khong khop roster
- Trang thai: **DUNG O DIEM DUNG 2**

## Test viet truoc

Output fail truoc implementation:

```text
AssertionError [ERR_ASSERTION]: Parser khong duoc ghi noi dung ngan hang vao nguoi_nop; phai ghi "Unknown"
```

## Thay doi

- `lib/transaction-parser.js`: hai nhanh `fallback_raw` va `no_match` ghi sentinel `Unknown`; van giu `parsingMethod` va confidence.
- `scripts/backfill-unknown-nguoi-nop.js`: chi in ba cau SQL theo thu tu, khong tu chay UPDATE.
- `tests/club-notifications.test.js`: contract test cho parser.

## Ket qua focused

```text
$ node tests/club-notifications.test.js
club-notifications (parser): PASS
```

## Diem dung 2 — count truoc

Project Supabase: `uhhlelemewilgsdijwja`
Group: `1`

```text
se_doi: 31
so_chuoi_rac: 17
```

So `31` nam trong khoang du kien `28–36` va duoi nguong an toan `100`.

**Chua chay UPDATE. Chua co count sau.**

## Lech so voi ke hoach

Khong co ve implementation. Theo yeu cau van hanh, chi chay cau dem truoc qua kenh read-only va dung truoc UPDATE.