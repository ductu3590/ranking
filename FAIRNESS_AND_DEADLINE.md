# ✅ Fair Play: Blur BLUE Team Until RED Submits

## New Rules Implemented

### 1. **Fairness Logic**
- **BLUE team pairings are BLURRED** until RED team submits
- Once RED team submits Round 1 → **Reveal all pairings**
- After **16:30 deadline** → **Reveal all** + **Lock editing**

### 2. **Deadline Enforcement (16:30)**
After 16:30, captains **cannot**:
- ❌ Save draft
- ❌ Submit pairings
- ❌ Unlock for editing

### 3. **Reveal Conditions**
Pairings are revealed when **ANY** of these is true:
1. ✅ RED team has submitted Round 1
2. ✅ Current time >= 16:30

## API Changes

### `/api/tournament/live/pairings`
**New logic**:
```javascript
const isPastDeadline = now >= new Date('2026-01-28T16:30:00+07:00');
const redHasSubmitted = /* check RED team submission */;
const canReveal = isPastDeadline || redHasSubmitted;
```

**Response includes**:
```json
{
  "canRevealRound1": false,
  "isPastDeadline": false,
  "redHasSubmitted": false,
  "pairings": { ... }
}
```

## Captain Page Changes

### Deadline Checks Added:
1. **`saveDraft()`** - Block if Round 1 after 16:30
2. **`submitPairings()`** - Block if Round 1 after 16:30
3. **`unlockForEdit()`** - Block if after 16:30

### Error Messages:
- "⏰ Đã quá thời hạn 16:30. Không thể lưu danh sách nữa."
- "⏰ Đã quá thời hạn 16:30. Không thể nộp danh sách nữa."
- "⏰ Đã quá thời hạn 16:30. Không thể chỉnh sửa danh sách nữa."

## Timeline Example

**Before RED submits** (e.g., 09:00):
- ✅ BLUE can edit/submit
- ✅ RED can edit/submit  
- 🔒 BLUE pairings **BLURRED** on Live page
- ✅ RED pairings visible (but empty until they submit)

**After RED submits** (e.g., 10:00):
- ✅ Both teams can still edit (before 16:30)
- ✅ **ALL pairings REVEALED** on Live page

**After 16:30**:
- ❌ No editing allowed
- ✅ ALL pairings REVEALED
- 🔒 Permanent lock

## Files Modified
1. `app/api/tournament/live/pairings/route.js` - Fairness + deadline logic
2. `app/tournament/captain/page.js` - Deadline enforcement
3. `app/tournament/live/page.js` - (Unchanged, already has blur UI)

## Status Messages

### Live Page:
- Before reveal: "🔒 Danh sách sẽ được mở khi Team ĐỎ nộp hoặc sau 16:30"
- After reveal: Shows all pairings clearly

### Captain Page:
- Before 16:30: Normal operation
- After 16:30: "⏰ Đã quá thời hạn" error when trying to edit
