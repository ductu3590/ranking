## After measurement - four-step workspace

Measured: 2026-09-21T14:30:26.998Z | viewport: 1440x900 | runs: 5 | roster: 14 active members | group_id: 52

| Flow | Requests | Time (ms) | Payload |
|---|---:|---|---:|
| Mở nháp | 2 | med 1300 / p95 1560 / min 1296 / max 1560 | 1062 B |
| Lưu nháp | 1 | med 1161 / p95 1293 / min 1143 / max 1293 | 754 B |
| Preview lịch | 3 | med 2740 / p95 3019 / min 2640 / max 3019 | 13804 B |
| Chốt tạo giải | 35 | med 5589 / p95 5828 / min 5474 / max 5828 | 239894 B |

| Roster mutation | Click to selection text render (ms) |
|---|---:|
| Add one member | med 45 / p95 49 |
| Remove one member | med 419 / p95 421 |

Roster requests: 5 (0 repeated within runs); courts/venues: 0 (0 repeated); finalize API repetitions: run 1: GET /api/tournament-v2/tournaments x4, run 1: GET /api/groups/session x6, run 1: GET /api/tournament-v2/stages?tournamentId=183 x2, run 1: GET /api/tournament-v2/assignments?tournamentId=183 x2, run 1: GET /api/tournament-v2/divisions?tournamentId=183 x2, run 1: GET /api/tournament-v2/setup?tournamentId=183&divisionId=167 x3, run 1: GET /api/club/branding x2, run 1: GET /api/club/notifications x2, run 2: GET /api/tournament-v2/tournaments x4, run 2: GET /api/groups/session x6, run 2: GET /api/tournament-v2/stages?tournamentId=184 x2, run 2: GET /api/tournament-v2/assignments?tournamentId=184 x2, run 2: GET /api/tournament-v2/divisions?tournamentId=184 x2, run 2: GET /api/tournament-v2/setup?tournamentId=184&divisionId=168 x3, run 2: GET /api/club/branding x2, run 2: GET /api/club/notifications x2, run 3: GET /api/tournament-v2/tournaments x4, run 3: GET /api/groups/session x6, run 3: GET /api/tournament-v2/stages?tournamentId=185 x2, run 3: GET /api/tournament-v2/assignments?tournamentId=185 x2, run 3: GET /api/tournament-v2/divisions?tournamentId=185 x2, run 3: GET /api/tournament-v2/setup?tournamentId=185&divisionId=169 x3, run 3: GET /api/club/branding x2, run 3: GET /api/club/notifications x2, run 4: GET /api/tournament-v2/tournaments x4, run 4: GET /api/groups/session x6, run 4: GET /api/tournament-v2/stages?tournamentId=186 x2, run 4: GET /api/tournament-v2/assignments?tournamentId=186 x2, run 4: GET /api/tournament-v2/divisions?tournamentId=186 x2, run 4: GET /api/tournament-v2/setup?tournamentId=186&divisionId=170 x3, run 4: GET /api/club/branding x2, run 4: GET /api/club/notifications x2, run 5: GET /api/tournament-v2/tournaments x4, run 5: GET /api/groups/session x6, run 5: GET /api/tournament-v2/stages?tournamentId=187 x2, run 5: GET /api/tournament-v2/assignments?tournamentId=187 x2, run 5: GET /api/tournament-v2/divisions?tournamentId=187 x2, run 5: GET /api/tournament-v2/setup?tournamentId=187&divisionId=171 x3, run 5: GET /api/club/branding x2, run 5: GET /api/club/notifications x2.

Capture complete: false. Payload totals include known bodies only; see JSON unknownBytes.

- Legacy baseline finalizes singles; current workflow finalizes doubles (14 people, 7 pairs). Not a controlled speedup comparison.
- Current flow timings include a 650ms network quiet delay; legacy quiet delay differs. These are UI journey timings, not API latency.
- Roster mutation timing ends at selection text render, not network settled; legacy mutation timing includes settling.
- New payload bytes are decoded response.body() lengths, not wire transfer sizes. Legacy bytes mix Content-Length (possibly encoded) and body lengths; missing bytes are unknown, not zero.
- Repeated method + URL within one run is a repetition, not proof of a redundant request; POST bodies may differ.