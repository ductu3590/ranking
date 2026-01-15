'use client';
import { useState } from 'react';

export default function TestWebhook() {
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState(null);
    const [error, setError] = useState(null);

    // Dữ liệu mẫu giống như SePay gửi
    const [formData, setFormData] = useState({
        transferAmount: 50000,
        transferContent: 'PKB TUAN NOP PHAT',
        referenceCode: 'TEST' + Date.now(),
        gateway: 'BIDV',
        accountNumber: '8867642952',
        accountName: 'DO DUC TU'
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setResponse(null);
        setError(null);

        try {
            const res = await fetch('/api/webhook', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const data = await res.json();
            setResponse({ status: res.status, data });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'transferAmount' ? parseInt(value) : value
        }));
    };

    const generateNewReference = () => {
        setFormData(prev => ({
            ...prev,
            referenceCode: 'TEST' + Date.now()
        }));
    };

    return (
        <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
            <h1 style={{ color: '#0070f3', marginBottom: '10px' }}>🧪 Test Webhook SePay</h1>
            <p style={{ color: '#666', marginBottom: '30px' }}>
                Gửi dữ liệu giả lập đến webhook để test mà không cần chuyển tiền thật
            </p>

            <form onSubmit={handleSubmit} style={{ background: '#f9f9f9', padding: '30px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
                        Số tiền (VNĐ):
                    </label>
                    <input
                        type="number"
                        name="transferAmount"
                        value={formData.transferAmount}
                        onChange={handleChange}
                        style={{ width: '100%', padding: '10px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
                        Nội dung chuyển khoản:
                    </label>
                    <input
                        type="text"
                        name="transferContent"
                        value={formData.transferContent}
                        onChange={handleChange}
                        placeholder="PKB TUAN NOP PHAT"
                        style={{ width: '100%', padding: '10px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                    <small style={{ color: '#666', fontSize: '12px' }}>
                        💡 Phải có chữ &quot;PKB&quot; và tên người nộp (VD: PKB TUAN)
                    </small>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
                        Mã giao dịch:
                    </label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                            type="text"
                            name="referenceCode"
                            value={formData.referenceCode}
                            onChange={handleChange}
                            style={{ flex: 1, padding: '10px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '6px' }}
                        />
                        <button
                            type="button"
                            onClick={generateNewReference}
                            style={{ padding: '10px 20px', background: '#666', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            🔄 Tạo mới
                        </button>
                    </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
                        Ngân hàng:
                    </label>
                    <input
                        type="text"
                        name="gateway"
                        value={formData.gateway}
                        onChange={handleChange}
                        style={{ width: '100%', padding: '10px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '14px',
                        fontSize: '18px',
                        fontWeight: '600',
                        background: loading ? '#ccc' : '#0070f3',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'background 0.2s'
                    }}
                >
                    {loading ? '⏳ Đang gửi...' : '🚀 Gửi Test Webhook'}
                </button>
            </form>

            {response && (
                <div style={{
                    marginTop: '30px',
                    padding: '20px',
                    background: response.status === 200 ? '#d4edda' : '#f8d7da',
                    border: `1px solid ${response.status === 200 ? '#c3e6cb' : '#f5c6cb'}`,
                    borderRadius: '8px'
                }}>
                    <h3 style={{ marginTop: 0, color: response.status === 200 ? '#155724' : '#721c24' }}>
                        {response.status === 200 ? '✅ Thành công!' : '❌ Có lỗi'}
                    </h3>
                    <p style={{ margin: '10px 0' }}>
                        <strong>Status:</strong> {response.status}
                    </p>
                    <p style={{ margin: '10px 0' }}>
                        <strong>Response:</strong>
                    </p>
                    <pre style={{
                        background: '#fff',
                        padding: '15px',
                        borderRadius: '6px',
                        overflow: 'auto',
                        fontSize: '14px'
                    }}>
                        {JSON.stringify(response.data, null, 2)}
                    </pre>
                </div>
            )}

            {error && (
                <div style={{
                    marginTop: '30px',
                    padding: '20px',
                    background: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: '8px',
                    color: '#721c24'
                }}>
                    <h3 style={{ marginTop: 0 }}>❌ Lỗi</h3>
                    <p>{error}</p>
                </div>
            )}

            <div style={{ marginTop: '40px', padding: '20px', background: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0, color: '#856404' }}>📝 Hướng dẫn test</h3>
                <ol style={{ color: '#856404', lineHeight: '1.8' }}>
                    <li>Nhập số tiền và nội dung chuyển khoản (phải có &quot;PKB&quot;)</li>
                    <li>Mã giao dịch sẽ tự động tạo, hoặc click &quot;Tạo mới&quot; nếu muốn test lại</li>
                    <li>Click &quot;Gửi Test Webhook&quot;</li>
                    <li>Kiểm tra kết quả và xem dữ liệu đã được lưu vào Supabase chưa</li>
                    <li>Quay lại trang chủ để xem bảng xếp hạng</li>
                </ol>
            </div>
        </div>
    );
}
