# ADR-001 — Modular monolith

- Trạng thái: `proposed`
- Ngày: 2026-09-02

## Bối cảnh

PickHub hiện là một ứng dụng Next.js + Supabase và chưa có bằng chứng rằng tải, đội ngũ hoặc chu kỳ triển khai yêu cầu microservice.

## Quyết định

Giữ modular monolith trong sáu phase. Tách module bằng domain boundary, service, repository, schema ownership và API contract. Chỉ tách service khi có số liệu chứng minh bottleneck hoặc yêu cầu vận hành độc lập.

## Hệ quả

- Giảm chi phí hạ tầng và distributed-system failure.
- Yêu cầu kỷ luật code boundary và test architecture.
- Có thể tách module sau vì domain interface đã rõ.
