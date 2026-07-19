import { useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/new-entries', label: 'New Entries' },
  { to: '/blogs', label: 'Blogs' },
  { to: '/banners', label: 'Banners' },
  { to: '/thoughts', label: 'Thought of the Day' },
  { to: '/categories', label: 'Categories' },
  { to: '/remedies', label: 'Remedies Shop' },
  { to: '/orders', label: 'Orders' },
  { to: '/gifts', label: 'Gifts' },
  { to: '/astro-services', label: 'Astro Services' },
  { to: '/live', label: 'Live Streams' },
  { to: '/missed', label: 'Missed Sessions' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/withdrawals', label: 'Withdrawals' },
  { to: '/reports', label: 'Reports' },
  { to: '/astrologers', label: 'Astrologers' },
  { to: '/reviews', label: 'Reviews' },
  { to: '/customers', label: 'Customers' },
  { to: '/sessions', label: 'Sessions' },
];

export default function Layout() {
  const { admin, logout, isAuthed } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  if (!isAuthed) return <Navigate to="/login" replace />;

  return (
    <div className={`layout${collapsed ? ' sidebar-collapsed' : ''}`}>
      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Open sidebar' : 'Close sidebar'}
        aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
      >
        {collapsed ? '☰' : '✕'}
      </button>
      <aside className="sidebar">
        <div className="brand">Astrowani Admin</div>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>
          ))}
        </nav>
        <div className="foot">
          <div>{admin?.email}</div>
          <button onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
