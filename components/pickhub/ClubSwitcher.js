'use client';

import './ClubSwitcher.css';

export default function ClubSwitcher({ clubs = [], defaultClubId = null, currentSession = null }) {
    const currentId = currentSession?.group_id || defaultClubId;
    const currentClub = clubs.find((club) => String(club.id) === String(currentId));
    const clubName = currentSession?.group_name || currentClub?.name || 'Chọn CLB';
    const clubCode = currentSession?.group_code || currentClub?.code || '';
    const mark = clubName.trim().charAt(0).toLocaleUpperCase('vi-VN') || 'P';

    return (
        <div className="club-switcher" aria-label="Không gian CLB">
            <div className="club-switcher-current">
                <span className="club-switcher-mark" aria-hidden="true">{mark}</span>
                <span className="club-switcher-body">
                    <small>Không gian CLB</small>
                    <strong>{clubName}</strong>
                    {clubCode && <em>{clubCode}</em>}
                </span>
            </div>
        </div>
    );
}
