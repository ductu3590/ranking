'use client';

import './FundTransactionList.css';

function money(value) {
    return Number(value || 0).toLocaleString('vi-VN');
}

function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

const CATEGORY_LABEL = {
    nop_quy: 'Nộp quỹ',
    nop_phat: 'Nộp phạt',
    khac: 'Khác',
};

function categoryClass(category) {
    if (category === 'nop_quy') return 'ph-badge ph-badge--positive';
    if (category === 'nop_phat') return 'ph-badge ph-badge--gold';
    return 'ph-badge ph-badge--muted';
}

export default function FundTransactionList({
    transactions,
    canManage = false,
    selectedIds = [],
    onToggleSelect,
    onEdit,
    onAssign,
}) {
    if (transactions.length === 0) {
        return <p className="fund-tx__empty">Không có giao dịch nào khớp bộ lọc.</p>;
    }

    return (
        <div className="fund-tx">
            {transactions.map((item) => {
                const isIncome = item.huong_giao_dich === 'in';
                const unassigned = !item.nguoi_nop;
                return (
                    <article className="fund-tx__row" key={item.id}>
                        {canManage && (
                            <input
                                type="checkbox"
                                className="fund-tx__pick"
                                checked={selectedIds.includes(item.id)}
                                onChange={() => onToggleSelect(item.id)}
                                aria-label={`Chọn giao dịch ${item.ma_giao_dich || item.id}`}
                            />
                        )}
                        <span
                            className={`fund-tx__ico${isIncome ? '' : ' fund-tx__ico--out'}${unassigned ? ' fund-tx__ico--wait' : ''}`}
                            aria-hidden="true"
                        >
                            {unassigned ? '?' : initials(item.nguoi_nop)}
                        </span>
                        <div className="fund-tx__body">
                            <strong className={`fund-tx__name${unassigned ? ' is-muted' : ''}`}>
                                {item.nguoi_nop || 'Chưa gán người nộp'}
                            </strong>
                            <p className="fund-tx__desc" title={item.noi_dung_goc || ''}>{item.noi_dung_goc || '(không có nội dung)'}</p>
                            <span className="fund-tx__meta">
                                {item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : 'chưa rõ thời điểm'}
                            </span>
                        </div>
                        <div className="fund-tx__right">
                            <span className={`fund-tx__amt ${isIncome ? 'is-in' : 'is-out'}`}>
                                {isIncome ? '+' : '−'}{money(Math.abs(item.so_tien))}đ
                            </span>
                            <span className={categoryClass(item.loai_giao_dich)}>
                                {CATEGORY_LABEL[item.loai_giao_dich] || 'Khác'}
                            </span>
                        </div>
                        {canManage && (
                            <div className="fund-tx__acts">
                                {unassigned && (
                                    <button type="button" className="ph-btn ph-btn--primary ph-btn--sm" onClick={() => onAssign(item)}>
                                        Gán người nộp
                                    </button>
                                )}
                                <button type="button" className="ph-btn ph-btn--outline ph-btn--sm" onClick={() => onEdit(item)}>
                                    Sửa
                                </button>
                            </div>
                        )}
                    </article>
                );
            })}
        </div>
    );
}
