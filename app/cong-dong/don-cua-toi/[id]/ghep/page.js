import PartnerClient from './PartnerClient';

export const dynamic = 'force-dynamic';

// Rủ bạn ghép cặp (Epic 4 C2; Stitch PLC-05): link rủ, mời theo SĐT, lời mời đến, bảng tìm bạn ghép.
export default function PartnerPage({ params }) {
  return <PartnerClient registrationId={Number(params.id)} />;
}
