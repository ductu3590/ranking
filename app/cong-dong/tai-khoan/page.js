import { Suspense } from 'react';
import AccountClient from './AccountClient';

export const dynamic = 'force-dynamic';

// Tạo tài khoản / Đăng nhập VĐV công khai (Epic 4 C1; Stitch PLC-02, PLC-03).
export default function PlayerAccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountClient />
    </Suspense>
  );
}
