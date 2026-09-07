'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPublicRegistration, submitPublicRegistration } from '@/lib/tournamentV2Client';
import './../../openreg.css';

function emptyMember() {
  return { full_name: '', phone: '', phr: '', gender: '', dob: '' };
}

export default function RegistrationFormPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug;
  const divisionId = params?.division;

  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const [members, setMembers] = useState([emptyMember()]);
  const [selfClub, setSelfClub] = useState('');
  const [company, setCompany] = useState(''); // honeypot

  const isPair = info?.division?.entrant_type === 'pair';
  const fields = info?.fields || { phr: false, gender: false, dob: false };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getPublicRegistration(slug, divisionId);
        if (!active) return;
        setInfo(data);
        if (data?.division?.entrant_type === 'pair') setMembers([emptyMember(), emptyMember()]);
      } catch (err) {
        if (active) setError(err.message || 'Không tải được thông tin nội dung.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [slug, divisionId]);

  const capacityLabel = useMemo(() => {
    if (!info || info.capacity == null) return 'Không giới hạn';
    const free = Math.max(0, info.capacity - (info.registered || 0));
    return `${info.registered || 0}/${info.capacity} — còn ${free} suất`;
  }, [info]);

  function updateMember(idx, key, value) {
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, [key]: value } : m)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payloadMembers = members
        .filter((m) => String(m.full_name || '').trim() || m.phone)
        .map((m) => {
          const rec = { full_name: m.full_name, phone: m.phone };
          if (fields.phr) rec.phr = m.phr;
          if (fields.gender) rec.gender = m.gender;
          if (fields.dob) rec.dob = m.dob;
          return rec;
        });
      const res = await submitPublicRegistration({
        slug,
        divisionId,
        members: payloadMembers,
        self_declared_club: selfClub || null,
        company, // honeypot — server từ chối nếu có giá trị
      });
      setSuccess(res);
    } catch (err) {
      setError(err.message || 'Đăng ký thất bại.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="dk-page"><div className="dk-state">Đang tải...</div></div>;
  if (error && !info) return <div className="dk-page"><div className="dk-alert error">{error}</div></div>;

  if (success) {
    return (
      <div className="dk-page">
        <div className="dk-alert success">Đăng ký thành công! Vui lòng lưu mã tra cứu bên dưới.</div>
        <div className="dk-card">
          <div className="dk-status-row"><span>Trạng thái</span><strong>{success.registration?.needs_partner ? 'Đang chờ ghép cặp' : 'Chờ BTC duyệt'}</strong></div>
          <div className="dk-status-row"><span>Mã tra cứu</span><code>{success.track_token}</code></div>
        </div>
        <button
          type="button"
          className="dk-btn"
          onClick={() => router.push(`/dk/theo-doi?token=${success.track_token}`)}
        >
          Theo dõi đăng ký
        </button>
      </div>
    );
  }

  const gate = info?.open;
  const closed = gate && !gate.ok;

  return (
    <div className="dk-page">
      <header className="dk-head">
        <h1 className="dk-title">{info?.tournament?.name}</h1>
        <p className="dk-subtitle">{info?.division?.name} · Sức chứa: {capacityLabel}</p>
      </header>

      {closed ? (
        <div className="dk-alert error">Nội dung này hiện đã đóng đăng ký.</div>
      ) : null}
      {error ? <div className="dk-alert error">{error}</div> : null}

      <form onSubmit={handleSubmit}>
        {members.map((m, idx) => (
          <div className="dk-member" key={idx}>
            <p className="dk-member-title">{isPair ? `VĐV ${idx + 1}` : 'Thông tin VĐV'}</p>
            <div className="dk-field">
              <label className="dk-label">Họ và tên <span className="dk-req">*</span></label>
              <input className="dk-input" value={m.full_name} onChange={(e) => updateMember(idx, 'full_name', e.target.value)} required={idx === 0} />
            </div>
            <div className="dk-field">
              <label className="dk-label">Số điện thoại <span className="dk-req">*</span></label>
              <input className="dk-input" type="tel" value={m.phone} onChange={(e) => updateMember(idx, 'phone', e.target.value)} required={idx === 0} />
            </div>
            {fields.phr ? (
              <div className="dk-field">
                <label className="dk-label">Điểm trình (PHR tự khai)</label>
                <input className="dk-input" type="number" step="0.1" value={m.phr} onChange={(e) => updateMember(idx, 'phr', e.target.value)} />
              </div>
            ) : null}
            {fields.gender ? (
              <div className="dk-field">
                <label className="dk-label">Giới tính <span className="dk-req">*</span></label>
                <select className="dk-select" value={m.gender} onChange={(e) => updateMember(idx, 'gender', e.target.value)}>
                  <option value="">-- Chọn --</option>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                </select>
              </div>
            ) : null}
            {fields.dob ? (
              <div className="dk-field">
                <label className="dk-label">Ngày sinh <span className="dk-req">*</span></label>
                <input className="dk-input" type="date" value={m.dob} onChange={(e) => updateMember(idx, 'dob', e.target.value)} />
              </div>
            ) : null}
          </div>
        ))}

        {isPair ? (
          <div className="dk-alert info">
            Chưa có bạn đánh cặp? Chỉ điền VĐV 1, hệ thống sẽ để bạn ở trạng thái chờ ghép cặp.
          </div>
        ) : null}

        <div className="dk-field">
          <label className="dk-label">CLB tự khai (không bắt buộc)</label>
          <input className="dk-input" value={selfClub} onChange={(e) => setSelfClub(e.target.value)} />
        </div>

        {/* Honeypot chống bot — người dùng thật không thấy */}
        <div className="dk-honeypot" aria-hidden="true">
          <label>Company<input tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
        </div>

        <button type="submit" className="dk-btn" disabled={submitting || closed}>
          {submitting ? 'Đang gửi...' : 'Đăng ký tham gia'}
        </button>
      </form>
    </div>
  );
}
