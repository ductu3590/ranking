const assert = require('assert');

const { buildOperationsRoadmap } = require('../../lib/tournament/operationsRoadmap');

const roadmap = buildOperationsRoadmap({
    courts: [
        { id: 1, label: 'Sân 01', active: true },
        { id: 2, label: 'Sân 02', active: false },
        { id: 3, label: 'Sân 03', active: true },
    ],
    matches: [
        { id: 1, status: 'live' },
        { id: 2, status: 'live' },
        { id: 3, status: 'pending' },
        { id: 4, status: 'finalized' },
    ],
});

assert.strictEqual(roadmap.length, 8, 'lộ trình điều hành luôn có đủ 8 bước');
assert.deepStrictEqual(roadmap.map((step) => step.id), ['info', 'courts', 'roster', 'draw', 'live', 'results', 'audit', 'share']);
assert.deepStrictEqual(roadmap[1], {
    id: 'courts', number: 2, label: 'Sân & sơ đồ sân đấu', state: 'ready', summary: '2/3 sân sẵn sàng',
});
assert.deepStrictEqual(roadmap[4], {
    id: 'live', number: 5, label: 'Trung tâm điều hành', state: 'live', summary: '2 sân đang chạy · 1/4 đã xong',
});
assert.strictEqual(roadmap[5].state, 'ready', 'sau khi có trận đã chốt, kết quả có thể theo dõi');

console.log('operations roadmap behavior ok');
