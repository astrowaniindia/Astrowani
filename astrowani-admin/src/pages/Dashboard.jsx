import { useEffect, useState } from 'react';
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
    { label: 'Customers', key: 'customers' },
    { label: 'Astrologers', key: 'astrologers' },
    { label: 'Active Sessions', key: 'activeSessions' },
    { label: 'Total Sessions', key: 'totalSessions' },
    { label: 'Revenue (₹)', key: 'revenue' },
    { label: 'Admin Wallet Balance (₹)', key: 'adminWalletBalance' },
  ];

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      {error && <div className="error-text">{error}</div>}
      <div className="stat-grid">
        {cards.map((c) => (
          <div className="stat" key={c.key}>
            <div className="label">{c.label}</div>
            <div className="value">{stats ? (stats[c.key] ?? 0) : '…'}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Use the sidebar to author content (blogs, banners, thought of the day, categories) and
          manage astrologers, customers, and sessions. Published content appears in the customer
          app in real time.
        </p>
      </div>
    </div>
  );
}
