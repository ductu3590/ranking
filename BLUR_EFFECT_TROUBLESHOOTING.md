# 🔧 Fix: Blur Effect Not Working

## Problem
Blur effect không hiển thị mặc dù đã update code và database.

## Root Cause
1. **Database JSONB issue**: PostgreSQL JSONB column lưu string với dấu ngoặc kép: `"2026-01-28T16:30:00+07:00"` thay vì `2026-01-28T16:30:00+07:00`
2. **Browser cache**: Browser có thể cache kết quả API cũ

## Solution Applied

### 1. Fixed Code (✅ Done)
Updated `lib/tournamentHelpers.js` to remove wrapping quotes:
```javascript
// Remove wrapping quotes: "2026-01-28..." -> 2026-01-28...
timeString = revealTime.replace(/^"(.*)"$/, '$1');
```

### 2. Database Update Required
Run this SQL in Supabase:
```sql
UPDATE tournament_settings
SET setting_value = to_jsonb('2026-01-28T16:30:00+07:00'::text),
    updated_at = NOW()
WHERE tournament_id = 1 
  AND setting_key = 'round1_reveal_time';
```

### 3. Clear Browser Cache
- Press `Ctrl + Shift + R` (Windows/Linux)
- Or `Cmd + Shift + R` (Mac)
- Or open DevTools (F12) → Network tab → Check "Disable cache"

## Verification Steps

1. **Check API response**:
```bash
curl http://localhost:3000/api/tournament/live/pairings | jq '.canRevealRound1'
```
Should return: `false` (before 16:30)

2. **Check database value**:
```sql
SELECT setting_value FROM tournament_settings 
WHERE setting_key = 'round1_reveal_time';
```

3. **Reload live page** with cache cleared:
- Visit: http://localhost:3000/tournament/live
- Should see blurred Round 1 with lock message

## Current Time vs Reveal Time
- Current time: ~09:13
- Reveal time: 16:30
- **Hours until reveal**: ~7.3 hours
- **Should blur**: YES (before 16:30)

## If Still Not Working
Try these debug APIs:
1. Check setting: `http://localhost:3000/api/debug/check-setting`
2. Force update: `POST http://localhost:3000/api/debug/fix-reveal-time`
