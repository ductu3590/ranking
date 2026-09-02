# Phase 5 — Trình độ VĐV và ghép cân bằng

## 1. Mục tiêu

Xây hệ thống trình độ có nguồn gốc, lịch sử và độ tin cậy; dùng nó để phân nội dung và đề xuất ghép cân bằng. Rating phải giải thích được, replay được và không bị thay đổi ngược lịch sử giải.

Nhánh: `codex/phase-5-player-rating`

## 2. Nguyên tắc

- “Trưởng CLB đánh giá” và “rating tính từ trận” là hai nguồn khác nhau.
- Không ghi đè một cột level duy nhất.
- Chỉ match finalized, đủ điều kiện và không bị loại khỏi rating mới tạo rating event.
- Mỗi registration/entry giữ rating snapshot tại thời điểm duyệt.
- Rating hiện tại luôn kèm discipline, confidence/reliability, algorithm version và updated_at.
- Phase 5 không tuyên bố tương đương DUPR nếu không có thỏa thuận/phương pháp tương thích được xác minh.

## 3. Mô hình dữ liệu

### 3.1 `skill_schemes`

- Scheme ID/version, labels, numeric mapping, phạm vi sử dụng.
- Scheme ban đầu có các band phong trào do PickHub chốt.
- Mapping giữa scheme là explicit và versioned, không suy luận ngầm.

### 3.2 `skill_assessments`

- Athlete, discipline, scheme/version, value/band.
- Source: `club_assessment`, `self_report`, `tournament_override`, `external_import`.
- Assessor profile/club, evidence note, effective_at, supersedes ID.
- Không update/delete; correction tạo assessment mới.

### 3.3 `rating_events`

- Athlete, match/result reference, pre/post values, expected/observed performance.
- Algorithm version, weight/source class và computation batch.
- Idempotent unique theo athlete + match + algorithm version.
- Cho phép replay toàn bộ rating từ seed state.

### 3.4 `athlete_ratings`

- Projection hiện tại theo athlete + discipline + algorithm version.
- Rating value, confidence/reliability, rated match count, last activity.
- Có trạng thái `unrated`, `provisional`, `established`, `stale`, `under_review`.

### 3.5 `rating_snapshots`

- Snapshot gắn registration/entry: rating, assessment, reliability, captured_at và policy version.
- Không thay đổi sau roster approval; reclassification tạo decision record.

### 3.6 `rating_reviews`

- Appeal/sandbagging concern, evidence, reviewer, decision và effective action.
- Organizer override luôn cần reason và audit.

## 4. Giai đoạn áp dụng

### 4.1 Manual-first

- Captain đánh giá theo scheme chung.
- Tournament director xem assessment + lịch sử và được override có lý do.
- Division eligibility dựa trên snapshot và policy.
- Rating máy chỉ hiển thị thử nghiệm, không tự chặn đăng ký.

### 4.2 Shadow rating

- Tính rating từ match finalized nhưng chỉ dùng dashboard nội bộ.
- So sánh với đánh giá captain và kết quả thực tế.
- Đo calibration, volatility, bias theo CLB và sample size.
- Không publish thay đổi cho VĐV nếu algorithm chưa được phê duyệt.

### 4.3 Assisted decisions

- Hiển thị rating + reliability cho captain/director.
- Cảnh báo play-down hoặc outlier; con người quyết định.
- Ghép cân bằng dùng rating với uncertainty penalty.

### 4.4 Official PickHub rating

Chỉ bật sau khi shadow evaluation đạt tiêu chí được ghi trong test evidence và product approval. Algorithm version đầu tiên được freeze; thay đổi lớn tạo version mới và migration/recompute plan.

## 5. Rating engine contract

Engine thuần và deterministic:

```text
initialize(athlete, seed_context) -> rating state
applyMatch(rating_states, finalized_match, policy) -> rating events
project(events) -> current ratings
explain(event) -> human-readable factors
computeReliability(history) -> score + reasons
```

Algorithm cụ thể được quyết định bằng ADR riêng sau shadow research. Core contract không phụ thuộc công thức Elo/DUPR-like cụ thể.

## 6. Balanced matching engine

Input:

- Eligible athlete/entry pool.
- Rating snapshot và uncertainty.
- Partner/opponent history.
- Club/division/gender/availability constraints.
- Số court/round và template policy.

Objective được version hóa, ví dụ:

- Giảm chênh lệch tổng sức mạnh dự kiến.
- Phạt lặp partner/opponent.
- Cân bằng số trận và thời gian nghỉ.
- Tôn trọng hard constraints trước soft objectives.

Output:

- Một hoặc nhiều phương án.
- Score từng objective.
- Constraint warnings.
- Explanation để director hiểu và duyệt.
- Seed để tái tạo kết quả.

Engine không tự commit. Director preview, chọn và commit qua transaction/version như Phase 3–4.

## 7. Chống thao túng và chất lượng dữ liệu

- Assessment lưu assessor và lịch sử; không sửa lùi.
- Match do tournament/club verified có provenance cao hơn self-report.
- Reliability thấp được hiển thị rõ và giảm ảnh hưởng lên quyết định tự động.
- Phát hiện outlier chỉ tạo review, không tự buộc tội hoặc khóa.
- Một athlete merge/split phải replay rating có kiểm soát.
- Organizer không thể đổi snapshot âm thầm sau registration close.

## 8. UI

- Athlete progress: rating/assessment timeline, reliability, match sources.
- Captain roster: đánh giá trình, lịch sử và cảnh báo stale.
- Director eligibility review: snapshot, override reason và appeals.
- Balanced draw preview: phương án, fairness score, explanation.
- Public profile chỉ hiển thị theo privacy setting và status đủ tin cậy.

## 9. Ngoài phạm vi

- Cam kết tương thích thuật toán bên thứ ba khi chưa có API/thỏa thuận.
- Dùng dữ liệu sức khỏe hoặc thuộc tính nhạy cảm để rating.
- AI black-box tự quyết định hạng trình.
- Mở rating public toàn quốc trước shadow validation.

## 10. Test và validation bắt buộc

### Unit/property tests

- Determinism và idempotency.
- Replay rating event cho kết quả giống projection.
- Không double-count một match.
- Algorithm invariant và numeric bounds.
- Balanced matcher luôn tôn trọng hard constraints.
- Same seed/input cho cùng output.

### Dataset tests

- Synthetic corpus: upset, expected win, missing history, stale athlete, mixed reliability.
- Historical finalized matches đã được anonymize/approved.
- Merge athlete, corrected result và algorithm version change.
- Bias/calibration report theo sample size và club; không kết luận khi nhóm quá nhỏ.

### Integration/security

- Chỉ assessor được cấp quyền mới tạo club assessment.
- Athlete xem lịch sử của mình; không sửa nguồn verified.
- Override/appeal tạo audit.
- Rating job retry không tạo event trùng.
- Public projection tuân privacy.

### E2E

- Captain đánh giá → đăng ký giải → snapshot → director duyệt.
- Finalize match → rating batch → dashboard cập nhật.
- Correction result → replay/recompute đúng.
- Preview balanced pairing → director commit → lịch tái tạo được.

## 11. Exit gate

- Manual assessment workflow được các captain pilot dùng và xác nhận.
- Shadow rating có báo cáo calibration/reliability và không còn lỗi replay.
- Balanced matching vượt test corpus và được director đánh giá hợp lý trong rehearsal.
- Quyết định có/không bật official rating được ghi bằng ADR; không mặc định bật.
- Evidence `evidence/phase-5-test-report.md` PASS.
- Privacy/appeal/explanation workflow được xác nhận.

## 12. Điều kiện mở Phase 6

Identity, tournament operations và rating ledger ổn định; dữ liệu có provenance đủ để mở onboarding tự phục vụ mà không khuếch đại dữ liệu sai.
