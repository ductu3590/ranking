## After measurement - four-step workspace

Measured: 2026-09-21T09:25:43.660Z | viewport: 1440x900 | runs: 5 | roster: 14 active members | group_id: 50

| Flow | Requests | Time (ms) | Payload |
|---|---:|---|---:|
| Mở nháp | 5 | med 1771 / p95 1809 / min 1733 / max 1809 | 57974 B |
| Lưu nháp | 1 | med 1310 / p95 1945 / min 1305 / max 1945 | 754 B |
| Preview lịch | 3 | med 2779 / p95 3094 / min 2723 / max 3094 | 13804 B |
| Chốt tạo giải | 52 | med 6979 / p95 7280 / min 6931 / max 7280 | 1785977 B |

| Roster mutation | Click to settled (ms) |
|---|---:|
| Add one member | med 46 / p95 51 |
| Remove one member | med 408 / p95 433 |

Duplicate roster requests: 10; courts/venues: 0; finalize API duplicates: POST /api/tournament-v2/setup/finalize x5, GET /api/tournament-v2/tournaments x30, GET /api/groups/session x55, GET /api/tournament-v2/stages?tournamentId=175 x3, GET /api/tournament-v2/divisions?tournamentId=175 x3, GET /api/tournament-v2/assignments?tournamentId=175 x3, GET /api/tournament-v2/setup?tournamentId=175&divisionId=159 x5, GET /api/club/branding x20, GET /api/tournament-v2/athletes?mode=roster x10, GET /api/identity/athlete-sessions x10, GET /api/club/notifications x20, GET /api/tournament-v2/stages?tournamentId=176 x3, GET /api/tournament-v2/divisions?tournamentId=176 x3, GET /api/tournament-v2/assignments?tournamentId=176 x3, GET /api/tournament-v2/setup?tournamentId=176&divisionId=160 x5, GET /api/tournament-v2/stages?tournamentId=177 x3, GET /api/tournament-v2/divisions?tournamentId=177 x3, GET /api/tournament-v2/assignments?tournamentId=177 x3, GET /api/tournament-v2/setup?tournamentId=177&divisionId=161 x5, GET /api/tournament-v2/divisions?tournamentId=178 x3, GET /api/tournament-v2/stages?tournamentId=178 x3, GET /api/tournament-v2/assignments?tournamentId=178 x3, GET /api/tournament-v2/setup?tournamentId=178&divisionId=162 x5, GET /api/tournament-v2/divisions?tournamentId=179 x3, GET /api/tournament-v2/stages?tournamentId=179 x3, GET /api/tournament-v2/assignments?tournamentId=179 x3, GET /api/tournament-v2/setup?tournamentId=179&divisionId=163 x5.