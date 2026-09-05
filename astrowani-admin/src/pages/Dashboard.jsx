import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/api/admin/stats')
      .then(({ data }) => setStats(data.stats))
      .catch((e) => setError(e.response?.data?.message || e.message));
  }, []);

  const cards = [
    { label: 'Total Customers', key: 'customers', icon: '👥' },
    { label: 'Verified Astrologers', key: 'astrologers', icon: '⭐' },
    { label: 'Live Active Calls', key: 'activeSessions', icon: '🟢', highlight: true },
    { label: 'Total Consultations', key: 'totalSessions', icon: '💬' },
    { label: 'Platform Revenue', key: 'revenue', icon: '💰', isCurrency: true },
    { label: 'Admin Wallet Balance', key: 'adminWalletBalance', icon: '🏦', isCurrency: true },
  ];

  const formatVal = (val, isCurrency) => {
    if (val === null || val === undefined) return '…';
    const num = Number(val);
    if (isNaN(num)) return val;
    if (isCurrency) return `₹${num.toLocaleString('en-IN')}`;
    return num.toLocaleString('en-IN');
  };

  return (
    <div style={{ maxWidth: 1280 }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--maroon)', background: 'var(--maroon-50)', padding: '3px 10px', borderRadius: 20, marginBottom: 8 }}>
            <span>🪐</span> ASTROWANI EXECUTIVE COMMAND
          </div>
          <h1>Platform Operations</h1>
          <p>Real-time statistics, active consultations, and operational shortcuts.</p>
        </div>
        <div className="btn-group">
          <Link to="/astrologers" className="btn secondary sm">
            <span>👥</span> Astrologers
          </Link>
          <Link to="/orders" className="btn sm">
            <span>🛍️</span> Store Orders
          </Link>
        </div>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 20 }}>{error}</div>}

      {/* ── 1. Smart "Needs Attention Today" Bar ── */}
      <div className="attention-banner">
        <div className="attention-header">
          <div className="attention-title">
            <span>⚡</span> Priority Workflows
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Direct operational shortcuts</span>
        </div>
        <div className="attention-grid">
          {/* Card 1: Astrologer Approvals */}
          <Link to="/astrologers" className="attention-card">
            <div className="attention-card-left">
              <div className="attention-icon-box" style={{ background: '#fef3c7', color: '#b45309' }}>
                ⭐
              </div>
              <div>
                <div className="attention-count">{stats ? `${stats.astrologers ?? 0} Total` : '…'}</div>
                <div className="attention-desc">Manage onboarding and rates</div>
              </div>
            </div>
            <div className="attention-action">Review →</div>
          </Link>

          {/* Card 2: Orders to Fulfill */}
          <Link to="/orders" className="attention-card">
            <div className="attention-card-left">
              <div className="attention-icon-box" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                🛍️
              </div>
              <div>
                <div className="attention-count">Store Orders</div>
                <div className="attention-desc">Gemstones, yantras & remedies fulfillment</div>
              </div>
            </div>
            <div className="attention-action">Manage →</div>
          </Link>

          {/* Card 3: Live Consultations */}
          <Link to="/sessions" className="attention-card">
            <div className="attention-card-left">
              <div className="attention-icon-box" style={{ background: '#ecfdf5', color: '#059669' }}>
                🟢
              </div>
              <div>
                <div className="attention-count">{stats ? `${stats.activeSessions ?? 0} Live` : '…'}</div>
                <div className="attention-desc">Ongoing chat & audio call consultations</div>
              </div>
            </div>
            <div className="attention-action">Monitor →</div>
          </Link>
        </div>
      </div>

      {/* ── 2. Primary KPI Stat Grid ── */}
      <div className="stat-grid">
        {cards.map((c) => (
          <div className="stat" key={c.key}>
            <div className="stat-header">
              <span className="label">{c.label}</span>
              <div className="stat-icon-wrap">{c.icon}</div>
            </div>
            <div className="value">
              {stats ? formatVal(stats[c.key] ?? 0, c.isCurrency) : '…'}
            </div>
            <div className="stat-footer">
              <span className="muted">Synchronized live with database</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. Operational Shortcuts Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginBottom: 28 }}>
        <Link to="/banners" className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--maroon-50)', color: 'var(--maroon)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            📢
          </div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>App Home Banners</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Publish promotions and featured carousels</div>
          </div>
        </Link>

        <Link to="/categories" className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef9e7', color: '#b89726', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            🔮
          </div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Specialty Categories</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vedic, Tarot, Vastu, Palmistry & Numerology</div>
          </div>
        </Link>

        <Link to="/reviews" className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            ⭐
          </div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Customer Reviews</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Review 5-star ratings and client testimonials</div>
          </div>
        </Link>

        <Link to="/support-inbox" className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            🎧
          </div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Support Inbox</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Respond to customer queries and ticket chats</div>
          </div>
        </Link>
      </div>

      {/* ── 4. System Sync Notice ── */}
      <div className="card">
        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
          Real-Time Mobile Application Synchronization
        </h3>
        <p className="muted" style={{ margin: 0, lineHeight: 1.6, fontSize: 13 }}>
          All updates to astrologer verifications, session rates, order fulfillments, and marketing banners
          are synced immediately to the customer and vendor mobile apps. Use the navigation sidebar or workspace
          switchers to jump to any tool.
        </p>
      </div>
    </div>
  );
}
