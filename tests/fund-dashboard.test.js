const assert = require('assert');

let buildFundEventPanel;
let organizeFundEvents;
try {
    ({ buildFundEventPanel, organizeFundEvents } = require('../lib/fundDashboard'));
} catch {
    buildFundEventPanel = undefined;
    organizeFundEvents = undefined;
}

assert.strictEqual(
    typeof organizeFundEvents,
    'function',
    'Dashboard quỹ cần có hàm phân loại sự kiện để chỉ ưu tiên sự kiện còn cần theo dõi.'
);
assert.strictEqual(
    typeof buildFundEventPanel,
    'function',
    'Dashboard quỹ cần mô hình trạng thái để sự kiện đã qua vẫn mở lại được khi cần quản lý.'
);

const events = [
    {
        id: 1,
        title: 'Quỹ tháng 9',
        is_active: true,
        fund_event_participants: [
            { id: 11, has_paid: true },
            { id: 12, has_paid: false },
        ],
    },
    {
        id: 2,
        title: 'Thuê sân tháng 8',
        is_active: true,
        fund_event_participants: [
            { id: 21, has_paid: true },
            { id: 22, has_paid: true },
        ],
    },
    {
        id: 3,
        title: 'Áo thi đấu',
        is_active: false,
        fund_event_participants: [
            { id: 31, has_paid: false },
        ],
    },
    {
        id: 4,
        title: 'Quỹ không có người tham gia',
        is_active: true,
        fund_event_participants: [],
    },
    {
        id: 5,
        title: 'Tiệc cuối năm',
        is_active: true,
        fund_event_participants: [
            { id: 51, has_paid: false },
        ],
    },
];

const organized = organizeFundEvents(events);

assert.strictEqual(
    organized.featuredEvent.id,
    1,
    'Sự kiện chưa thu đủ tiền và mới nhất phải là sự kiện nổi bật.'
);
assert.deepStrictEqual(
    organized.otherActiveEvents.map((event) => event.id),
    [4, 5],
    'Các sự kiện còn hoạt động khác phải được thu gọn vào phần xem thêm.'
);
assert.deepStrictEqual(
    organized.archivedEvents.map((event) => event.id),
    [2, 3],
    'Sự kiện đã thu đủ hoặc bị tắt phải chuyển vào lịch sử.'
);

assert.deepStrictEqual(
    organizeFundEvents([]),
    { featuredEvent: null, otherActiveEvents: [], archivedEvents: [] },
    'Không có sự kiện thì dashboard không được dành chỗ cho khối sự kiện.'
);

assert.deepStrictEqual(
    buildFundEventPanel(events, false).visibleEvents.map((event) => event.id),
    [1],
    'Mặc định dashboard chỉ hiển thị sự kiện nổi bật.'
);
assert.deepStrictEqual(
    buildFundEventPanel(events, true).visibleEvents.map((event) => event.id),
    [1, 4, 5, 2, 3],
    'Khi xem thêm, dashboard phải cho truy cập cả sự kiện hoạt động khác và sự kiện đã qua.'
);

const archivedOnlyEvents = events.filter((event) => [2, 3].includes(event.id));
assert.strictEqual(
    buildFundEventPanel(archivedOnlyEvents, false).showPanel,
    false,
    'Chỉ có sự kiện đã qua thì trang chính không được tự dành diện tích cho khối sự kiện.'
);
assert.deepStrictEqual(
    buildFundEventPanel(archivedOnlyEvents, true).visibleEvents.map((event) => event.id),
    [2, 3],
    'Người dùng vẫn phải mở lại được sự kiện đã qua để xem hoặc quản lý.'
);
assert.strictEqual(
    buildFundEventPanel(archivedOnlyEvents, true).showPanel,
    true,
    'Khi người dùng mở lịch sử, khối sự kiện phải thực sự được render.'
);

console.log('fund dashboard behavior ok');
