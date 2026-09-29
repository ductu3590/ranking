import PublicTournamentClient from './PublicTournamentClient';

export const dynamic = 'force-dynamic';

// Trang giải công khai (Epic 4 C2; Stitch PLC-07): thông tin giải + tên các cặp đã duyệt. Không SĐT, không đơn chờ.
export default function PublicTournamentPage({ params }) {
  return <PublicTournamentClient slug={params.slug} />;
}
