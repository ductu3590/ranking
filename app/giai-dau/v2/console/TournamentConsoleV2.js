'use client';

// Stub — console quản lý giải (tạo đầy đủ ở task sau của Plan 3).
// Hiện chỉ render placeholder để route ?t=<id> không vỡ và import giải quyết được.

export default function TournamentConsoleV2({ tournamentId }) {
    return (
        <div className="v2-console-stub">
            <h2>Console giải đấu</h2>
            <p>Đang hoàn thiện màn quản lý chi tiết cho giải.</p>
            <p className="v2-console-stub-id">Mã giải: {tournamentId}</p>
        </div>
    );
}
