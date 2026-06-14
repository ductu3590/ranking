'use client';

import { useRouter } from 'next/navigation';

export default function TournamentDashboardActions({ tournament }) {
    const router = useRouter();

    async function handleDelete() {
        if (!confirm(`Xóa giải "${tournament.name}"?`)) return;
        if (!confirm('Xác nhận lần cuối: toàn bộ team, VĐV, lịch và cài đặt của giải này sẽ bị xóa.')) return;

        const res = await fetch(`/api/tournaments?id=${tournament.id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(data.error || 'Không xóa được giải đấu.');
            return;
        }
        router.refresh();
    }

    return (
        <div className="tournament-card-admin-actions" onClick={(event) => event.stopPropagation()}>
            <a
                href={`/admin?section=tournament&edit=${tournament.id}`}
                className="tournament-icon-action"
                aria-label={`Sửa ${tournament.name}`}
                title="Sửa giải"
            >
                <span aria-hidden="true">✎</span>
            </a>
            <button
                type="button"
                className="tournament-icon-action danger"
                aria-label={`Xóa ${tournament.name}`}
                title="Xóa giải"
                onClick={handleDelete}
            >
                <span aria-hidden="true">×</span>
            </button>
        </div>
    );
}
