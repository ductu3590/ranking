# ADR-005 — Quyết định sản phẩm của đợt tạo giải theo Stitch

**Ngày:** 2026-09-23
**Trạng thái:** đã chấp nhận (người dùng duyệt plan và spec ngày 2026-09-23)
**Liên quan:** plan `docs/superpowers/plans/2026-09-23-tournament-setup-stitch-recovery.md`, spec `docs/superpowers/specs/2026-09-23-stitch-setup/`, ADR-001 (nhãn bước), ADR-002 (giao hữu liên CLB), `00-contract.md`

## Bối cảnh

Đợt 2026-09-19 dựng workspace bốn bước nhưng để lại nhiều chỗ lệch: client/SQL lệch shape `selectedMemberIds`/`memberIds`, còn danh sách dự bị, ghép cặp kéo-thả, preview/finalize chỉ nhận một thể thức, và UI chưa theo thiết kế chuẩn. Người dùng chọn thiết kế Stitch (`_workspace/stitch-internal-setup/`) làm chuẩn thị giác, nhưng ghi đè một số chi tiết của Stitch và của contract cũ.

## Quyết định

| # | Quyết định | Thay cho |
|---|---|---|
| D1 | Ghép cặp bằng chạm/chọn đúng hai người chưa ghép rồi bấm `Ghép cặp`, giống nhau trên mọi thiết bị. Không kéo-thả làm hành vi chính | Kéo-thả trên desktop trong Stitch |
| D2 | Không hiển thị seed, hash, hạt giống, DUPR. Rating chỉ tư vấn với nhãn `Trình độ`, không chặn khi thiếu | Mã hash hạt giống, chip DUPR, "Tự động cân bằng DUPR" trong Stitch |
| D3 | Không có danh sách dự bị. Số lẻ: thêm người hoặc chủ động bỏ chọn người lẻ | `reserveMemberIds`; lựa chọn "để một người dự bị" (00-contract, skill invariants §3.4) |
| D4 | Khách mời là VĐV riêng của giải: `tournament_athletes(source='guest', athlete_id NULL, client_ref)` | Chưa có đường chốt cho guest |
| D5 | Phát hành từng thể thức. Thể thức chưa có preview/finalize thật hiện thẻ khóa `Sắp có` và bị server từ chối (`FORMAT_NOT_AVAILABLE`) | UI hiện thể thức chưa chạy được |
| D6 | Vòng bảng: 2–4 bảng × lấy 1–2; tổng vào vòng loại 4 hoặc 8; thiếu bù bằng cặp xếp kế tiếp tốt nhất; mỗi bảng ≥ số suất + 1 | Cố định 2 bảng × lấy 2, tối thiểu 4 cặp |
| D7 | So chéo bảng: tỉ lệ thắng → hiệu số TB/trận → điểm ghi TB/trận → bốc thăm | — |
| D8 | Chỉ trận chung kết chọn BO1/BO3/BO5; mọi trận khác BO1. Ghi đè theo trận (`match_scoring.F`) vì `F` và `BRONZE` cùng `round` | BO riêng từng chặng trong Stitch |
| D9 | Ngoài quy mô khuyến nghị chỉ cảnh báo | — |
| D10 | Không autosave; lưu từng bước bằng nút; trạng thái lưu trung thực | "Đã lưu tự động lúc …" trong Stitch |
| D11 | Không canary; kiểm thử trên CLB test mới rồi deploy | Bước canary trong plan gốc |
| D12 | Bye ở loại trực tiếp là cặp vào thẳng vòng sau, không phải thay đồng đội | — |

Ngoài ra bỏ khỏi đợt này: tab "Thủ công" gán slot bảng, "Xuất PDF lịch", tải ảnh áp phích từ máy (chỉ nhận URL), panel đặc tả mã blocker, cột `Athlete_ID`.

## Hệ quả

- `00-contract.md` chuyển sang draft v3 (`participants.memberIds` + `guests`, `pairs[].participantRefs`, `unpairedRefs`, `progress.completedThrough`, không còn `reserveMemberIds`/`selectedMemberIds`).
- Skill `tournament-setup-invariants` sửa §3.4 và bổ sung D1, D4, D5.
- Tối thiểu 2 × 2 tăng từ 4 lên 6 cặp; draft cũ 4–5 cặp nhận blocker.
- `tournament_stage_transitions` cần thêm `source_kind='group_rank_pool'` (Lát A, migration additive thay CHECK).
