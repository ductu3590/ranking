# ✅ Captain Can Edit Submitted Pairings

## Feature Overview
Đội trưởng giờ có thể **sửa lại danh sách cặp đôi** sau khi đã nộp.

## Changes Made

### 1. Frontend - `app/tournament/captain/page.js`
- **Removed**: Message "Sau khi nộp sẽ không thể sửa"
- **Added**: `unlockForEdit()` function
- **Updated**: Action buttons UI to show "✏️ Sửa lại" button when submitted

#### New Flow:
1. Đội trưởng nộp danh sách → Status: `submitted`
2. Click nút "✏️ Sửa lại" → Status: `draft`
3. Chỉnh sửa lại pairings
4. Lưu và nộp lại

### 2. Backend - `app/api/tournament/captain/pairings/unlock/route.js`
- **New API endpoint**: `POST /api/tournament/captain/pairings/unlock`
- **Function**: Change pairing status from `submitted` back to `draft`
- **Clears**: `submitted_at` timestamp

### 3. CSS - `app/tournament/captain/captain.css`
- **New class**: `.btn-edit`
- **Style**: Orange outline button with hover effect

## User Interface

### Before Edit:
```
✅ Đã nộp danh sách Vòng 1  [✏️ Sửa lại]
```

### After Unlock:
```
💾 Lưu bản nháp  |  📬 Nộp danh sách
```

## Security & Validation
- ✅ Requires team authentication (via teamCode)
- ✅ Only captain can unlock their own team's pairings
- ✅ Confirmation dialog before unlocking
- ✅ Must resubmit after editing

## Database Impact
```sql
-- Unlock action:
UPDATE tournament_pairings
SET status = 'draft',
    submitted_at = NULL
WHERE team_id = ? AND round_number = ?
```

## Files Modified
1. `app/tournament/captain/page.js` - Added unlock function & UI
2. `app/api/tournament/captain/pairings/unlock/route.js` - New API
3. `app/tournament/captain/captain.css` - New button styles

## Testing
1. Navigate to captain page: `/tournament/captain`
2. Submit pairings for Round 1
3. Click "✏️ Sửa lại"
4. Verify inputs are editable
5. Make changes and resubmit
