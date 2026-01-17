'use client';

import { useState } from 'react';
import './test-parsing.css';

export default function TestParsingPage() {
    const [testContent, setTestContent] = useState('');
    const [testAmount, setTestAmount] = useState(20000);
    const [testAccountName, setTestAccountName] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const sampleContents = [
        'BIDV;96247HANA246;DONG MANH LINH',
        'MBVCB.12602468187.095309.NGUYEN VAN THANH',
        'QR - Vu Ngoc Hung chuyen khoan nhanh',
        'Dang Tien Anh chuyen khoan nhanh',
        'PKB TUAN nop phat',
        'PKB NAM dong quy thang 1',
        'DO DUC TU chuyen tien',
        'PKB HUNG nop quy'
    ];

    async function testParse() {
        setLoading(true);
        try {
            const response = await fetch('/api/test-parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: testContent,
                    amount: testAmount,
                    accountName: testAccountName
                })
            });

            const parseResult = await response.json();
            setResult(parseResult);
        } catch (error) {
            setResult({ error: error.message });
        }
        setLoading(false);
    }

    return (
        <div className="test-parsing-container">
            <div className="test-parsing-content">
                <h1 className="page-title">🧪 Test Transaction Parser</h1>

                {/* Sample Contents */}
                <div className="card">
                    <h2 className="card-title">Mẫu nội dung giao dịch</h2>
                    <div className="samples-grid">
                        {sampleContents.map((content, idx) => (
                            <button
                                key={idx}
                                onClick={() => setTestContent(content)}
                                className="sample-btn"
                            >
                                {content}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Test Form */}
                <div className="card">
                    <h2 className="card-title">Test Input</h2>

                    <div className="form-section">
                        <label className="form-label">Nội dung giao dịch</label>
                        <textarea
                            value={testContent}
                            onChange={(e) => setTestContent(e.target.value)}
                            className="form-textarea"
                            rows="3"
                            placeholder="Nhập nội dung giao dịch..."
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-section">
                            <label className="form-label">Số tiền</label>
                            <input
                                type="number"
                                value={testAmount}
                                onChange={(e) => setTestAmount(Number(e.target.value))}
                                className="form-input"
                            />
                        </div>

                        <div className="form-section">
                            <label className="form-label">Account Name (fallback)</label>
                            <input
                                type="text"
                                value={testAccountName}
                                onChange={(e) => setTestAccountName(e.target.value)}
                                className="form-input"
                                placeholder="NGUYEN VAN A"
                            />
                        </div>
                    </div>

                    <button
                        onClick={testParse}
                        disabled={loading}
                        className="btn-submit"
                    >
                        {loading ? '⏳ Đang parse...' : '🔍 Test Parse'}
                    </button>
                </div>

                {/* Results */}
                {result && (
                    <div className="card">
                        <h2 className="card-title">Kết quả</h2>

                        {result.error ? (
                            <div className="error-box">❌ Error: {result.error}</div>
                        ) : (
                            <>
                                <div className="results-grid">
                                    <div className="result-item blue">
                                        <div className="result-label">Tên thành viên</div>
                                        <div className="result-value large">{result.memberName}</div>
                                    </div>

                                    <div className="result-item green">
                                        <div className="result-label">Confidence Score</div>
                                        <div className={`result-value large ${result.confidence < 70 ? 'error' : 'success'}`}>
                                            {result.confidence}%
                                        </div>
                                    </div>

                                    <div className="result-item purple">
                                        <div className="result-label">Parsing Method</div>
                                        <div className="result-value">{result.parsingMethod}</div>
                                    </div>

                                    <div className="result-item yellow">
                                        <div className="result-label">Bank Detected</div>
                                        <div className="result-value">{result.bankDetected}</div>
                                    </div>

                                    <div className="result-item red">
                                        <div className="result-label">Loại giao dịch</div>
                                        <div className="result-value">
                                            {result.loaiGiaoDich === 'nop_phat' ? '🚨 Nộp phạt' :
                                                result.loaiGiaoDich === 'nop_quy' ? '💰 Nộp quỹ' : '📝 Khác'}
                                        </div>
                                    </div>

                                    <div className="result-item indigo">
                                        <div className="result-label">Hướng giao dịch</div>
                                        <div className="result-value">
                                            {result.huongGiaoDich === 'in' ? '⬇️ Tiền vào' : '⬆️ Tiền ra'}
                                        </div>
                                    </div>
                                </div>

                                {/* Raw JSON */}
                                <details className="json-details">
                                    <summary className="json-summary">📋 Raw JSON Result</summary>
                                    <pre className="json-pre">
                                        {JSON.stringify(result, null, 2)}
                                    </pre>
                                </details>
                            </>
                        )}
                    </div>
                )}

                {/* Back Button */}
                <div style={{ textAlign: 'center', marginTop: '24px' }}>
                    <a
                        href="/"
                        style={{
                            display: 'inline-block',
                            padding: '12px 24px',
                            background: 'rgba(255,255,255,0.2)',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: '8px',
                            fontWeight: 600,
                            border: '2px solid rgba(255,255,255,0.3)',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                    >
                        ← Về trang chủ
                    </a>
                </div>
            </div>
        </div>
    );
}
