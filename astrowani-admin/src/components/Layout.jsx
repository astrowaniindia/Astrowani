import { useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/analytics', label: 'Analytics' },
  { to: '/new-entries', label: 'New Entries' },
  { to: '/blogs', label: 'Blogs' },
  { to: '/banners', label: 'Banners' },
  { to: '/thoughts', label: 'Thought of the Day' },
  { to: '/categories', label: 'Categories' },
  // Two separate shops, deliberately two separate sections. /remedies is the Remedies
  // row on the app's Home screen; /wani-shop is the web storefront at
  // shop.astrowani.com. They share the remedy_items table but not their catalogues -
  // see remedy_items.channel.
  { to: '/remedies', label: 'Remedies (App)' },
  { to: '/wani-shop', label: 'Wani Shop (Web)' },
  { to: '/orders', label: 'Orders' },
  { to: '/gifts', label: 'Gifts' },
  { to: '/astro-services', label: 'Astro Services' },
  { to: '/live', label: 'Live Streams' },
  { to: '/live-aarti', label: 'Live Aarti & Pooja' },
  { to: '/missed', label: 'Missed Sessions' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/app-prompts', label: 'App Prompts' },
  { to: '/referral-popup', label: 'Referral Popup' },
  { to: '/free-bot-chat', label: 'Free Bot Chat' },
  // The free 12-minute intro CALL, which replaced the free bot chat above.
  // Both pages are kept: the bot chat is off, not deleted.
  { to: '/free-call-bookings', label: 'Free Call Bookings' },
  { to: '/guide-avatar', label: 'Guide Avatar' },
  { to: '/withdrawals', label: 'Withdrawals' },
  { to: '/reports', label: 'Reports' },
  { to: '/support-inbox', label: 'Support Inbox' },
  { to: '/support', label: 'Support Tickets (old)' },
  { to: '/astrologers', label: 'Astrologers' },
  { to: '/leaderboard', label: 'Leaderboard' },
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
