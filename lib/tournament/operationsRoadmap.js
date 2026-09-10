const ROADMAP = [
    ['info', 'Thông tin giải'],
    ['courts', 'Sân & sơ đồ sân đấu'],
    ['roster', 'VĐV & cặp đấu'],
    ['draw', 'Bốc thăm & lịch đấu'],
    ['live', 'Trung tâm điều hành'],
    ['results', 'Lịch & kết quả'],
    ['audit', 'Nhật ký thao tác'],
    ['share', 'Công bố & chia sẻ'],
];

function buildOperationsRoadmap({ courts = [], matches = [] } = {}) {
    const activeCourts = courts.filter((court) => court.active !== false).length;
    const totalCourts = courts.length;
    const liveMatches = matches.filter((match) => match.status === 'live').length;
    const completedMatches = matches.filter((match) => ['done', 'finalized'].includes(match.status)).length;

    return ROADMAP.map(([id, label], index) => {
        const number = index + 1;
        if (id === 'courts') return { id, number, label, state: activeCourts ? 'ready' : 'waiting', summary: `${activeCourts}/${totalCourts} sân sẵn sàng` };
        if (id === 'live') return { id, number, label, state: liveMatches ? 'live' : 'waiting', summary: `${liveMatches} sân đang chạy · ${completedMatches}/${matches.length} đã xong` };
        if (id === 'results') return { id, number, label, state: completedMatches ? 'ready' : 'waiting', summary: completedMatches ? `${completedMatches} trận đã có kết quả` : 'Chờ trận đầu tiên kết thúc' };
        return { id, number, label, state: number < 5 ? 'ready' : 'waiting', summary: '' };
    });
}

module.exports = { buildOperationsRoadmap };
