# Bằng chứng tương phản bàn điều hành

Ngày đo: 2026-09-09  
Tiêu chuẩn: WCAG 2 contrast ratio, ngưỡng AA 4.5:1 cho chữ thường; 3:1 cho chữ phụ.

Nền `--ops-indigo-soft` là lớp `rgba(111, 72, 201, 0.26)` pha trên `--ops-surface`,
cho màu nền hiệu dụng `#2C1F50` trước khi đo cặp lavender.

| Chữ | Nền | Tỉ lệ | Ngưỡng | Kết quả | Giá trị sau đo |
|---|---|---:|---:|---|---|
| `--ops-cyan #8FE6F7` | `--ops-surface #151125` | 13.02:1 | 4.5:1 | Đạt AA | Giữ nguyên |
| `--ops-gold #FFC95E` | `--ops-surface #151125` | 12.09:1 | 4.5:1 | Đạt AA | Giữ nguyên |
| `--ops-coral #FF8B83` | `--ops-surface #151125` | 8.14:1 | 4.5:1 | Đạt AA | Giữ nguyên |
| `--ops-ink-2 #A9A2C4` | `--ops-bg #0A0812` | 8.19:1 | 4.5:1 | Đạt AA | Giữ nguyên |
| `--ops-ink-3 #7A7398` | `--ops-bg #0A0812` | 4.48:1 | 3:1 | Đạt AA | Giữ nguyên |
| `--ops-lavender #CFC2FF` | `--ops-indigo-soft` trên `--ops-surface` (`#2C1F50`) | 9.03:1 | 4.5:1 | Đạt AA | Giữ nguyên |

Không có cặp nào trượt, nên không cần chỉnh sắc độ.