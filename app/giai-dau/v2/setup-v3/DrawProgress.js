'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TICK_MS, finishDelay, isSuccess, labelOnBar, progressLabel, simulatedPercent } from '@/lib/tournament/drawProgress';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Chạy một tác vụ (bốc thăm / cập nhật xem trước / chốt) kèm thanh % mô phỏng. Không đổi lời gọi API: task() là
// đúng hàm cũ; lỗi hoặc { ok: false } → ẩn thanh ngay, caller hiện lỗi như trước.
export function useDrawProgress() {
  const [progress, setProgress] = useState(null);
  const alive = useRef(true);
  // Bật lại khi mount: Strict Mode (dev) chạy mount → cleanup → mount, nếu chỉ tắt ở cleanup thì cờ kẹt false.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback(async (action, task) => {
    const startedAt = Date.now();
    setProgress({ action, percent: 0 });
    const timer = setInterval(() => {
      if (alive.current) setProgress((current) => (current && current.percent < 100 ? { ...current, percent: simulatedPercent(Date.now() - startedAt) } : current));
    }, TICK_MS);
    try {
      const result = await task();
      clearInterval(timer);
      if (!isSuccess(result)) {
        if (alive.current) setProgress(null);
        return result;
      }
      if (alive.current) setProgress({ action, percent: 100 });
      await sleep(finishDelay(Date.now() - startedAt));
      if (alive.current) setProgress(null);
      return result;
    } catch (error) {
      clearInterval(timer);
      if (alive.current) setProgress(null);
      throw error;
    }
  }, []);

  return { progress, run };
}

// Thanh tiến độ % (phỏng cấu trúc mẫu uiverse rust_1966/tall-fly-13, màu theo DESIGN.md sáng). Style ở studio.css.
export default function DrawProgress({ action, percent }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, []);
  const label = progressLabel(action);
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return (
    <section ref={ref} className="pc-card pc-progress-card" aria-live="polite">
      <p className="pc-progress__label">{label}</p>
      <div className="pc-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div className="pc-progress__bar" style={{ width: `${value}%` }}>
          <span className="pc-progress__dot" aria-hidden="true" />
          <span className="pc-progress__dot" aria-hidden="true" />
          <span className="pc-progress__dot" aria-hidden="true" />
          <span className="pc-progress__dot" aria-hidden="true" />
          <span className="pc-progress__dot" aria-hidden="true" />
        </div>
        <span className="pc-progress__text" data-on-bar={labelOnBar(value) || undefined} aria-hidden="true">{value}%</span>
      </div>
    </section>
  );
}
