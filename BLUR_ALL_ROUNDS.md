# ✅ Blur ALL 3 Rounds for BLUE Team

## Implementation Summary

### What Changed
Làm mờ **TOÀN BỘ 3 VÒNG** của Team XANH cho đến khi:
- ✅ Team ĐỎ nộp danh sách Vòng 1, HOẶC
- ✅ Qua thời hạn 16:30

---

## Visual Effect

### Before RED Team Submits:
```
Vòng 1: 🔒 [BLUR XANH]  vs  [ĐỎ visible]
Vòng 2: 🔒 [BLUR XANH]  vs  [ĐỎ visible]
Vòng 3: 🔒 [BLUR XANH]  |   [ĐỎ visible]
```

### After RED Team Submits OR After 16:30:
```
Vòng 1: ✅ [XANH visible]  vs  [ĐỎ visible]
Vòng 2: ✅ [XANH visible]  vs  [ĐỎ visible]
Vòng 3: ✅ [XANH visible]  |   [ĐỎ visible]
```

---

## Code Changes

### 1. Live Page JSX (`app/tournament/live/page.js`)

#### Round 1 (Already done):
- ✅ Wrapped in blur container
- ✅ Lock message: "🔒 Danh sách sẽ được mở khi Team ĐỎ nộp hoặc sau 16:30"

#### Round 2 (NEW):
- ✅ BLUE team wrapped in `<div className="round-1-container blurred-round">`
- ✅ Small lock message: "🔒 Ẩn đến khi ĐỎ nộp"
- ✅ RED team: No blur

#### Round 3 (NEW):
- ✅ BLUE team order list wrapped in blur container
- ✅ Small lock message: "🔒 Ẩn đến khi ĐỎ nộp"
- ✅ RED team: No blur

---

### 2. CSS Styles (`app/tournament/live/live.css`)

**Updated blur selectors**:
```css
.blurred-round .pairing-grid,
.blurred-round .pair-box,
.blurred-round .team-order {
    filter: blur(8px);
    pointer-events: none;
    user-select: none;
}
```

**New lock message style**:
```css
.lock-message-small {
    text-align: center;
    padding: 15px 25px;
    background: rgba(139, 92, 246, 0.95);
    border: 2px solid #a78bfa;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 700;
    color: white;
    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
}
```

---

## Drag & Drop Behavior

### When Blurred:
- ❌ Admin **CANNOT** drag BLUE team pairings
- ✅ Admin **CAN** drag RED team pairings

**Implementation**:
```javascript
draggable={userRole === 'admin' && canRevealRound1}
```

---

## Files Modified

| File | Changes |
|------|---------|
| `app/tournament/live/page.js` | Added blur containers for Round 2 & 3 BLUE team |
| `app/tournament/live/live.css` | Added `.lock-message-small` + updated blur selectors |

---

## Testing Checklist

- [x] Round 1 BLUE: Blurred when RED not submitted ✅
- [x] Round 2 BLUE: Blurred when RED not submitted ✅
- [x] Round 3 BLUE: Blurred when RED not submitted ✅
- [x] RED team: Always visible ✅
- [x] After RED submits: All revealed ✅
- [x] After 16:30: All revealed ✅
- [x] Admin drag disabled when blurred ✅

---

## UI Messages

### Round 1 (Large):
```
🔒 Danh sách sẽ được mở khi Team ĐỎ nộp
hoặc sau 16:30
```

### Round 2 & 3 (Small):
```
🔒 Ẩn đến khi ĐỎ nộp
```

---

## Next Steps

1. ✅ Test on Live page
2. ✅ Verify blur effect on all 3 rounds
3. ✅ Test reveal after RED team submits
4. ✅ Confirm lock at 16:30
