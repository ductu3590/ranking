# ADR-004 — Tách visual redesign khỏi core

- Trạng thái: `proposed`
- Ngày: 2026-09-02

## Bối cảnh

PickHub dự kiến thay đổi toàn bộ giao diện trong khi auth và luồng liên CLB vẫn đang được thiết kế lại.

## Quyết định

Lên kế hoạch IA/design system ngay, dùng reference UI trong Phase 1–3, và chỉ bắt đầu visual redesign đầy đủ sau khi Phase 3 được pilot và merge. Redesign nằm trên nhánh riêng và không thay đổi business rules.

## Hệ quả

- Tránh làm đẹp luồng sai và tránh big-bang UI sau Phase 6.
- Cần API view model và component boundary rõ từ đầu.
