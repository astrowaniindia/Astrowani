import { useState, useMemo } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Primary Workspaces — groups 29 tools into 4 logical departments
const WORKSPACES = [
  {
    id: 'all',
    label: 'All',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    id: 'astrology',
    label: 'Astrology',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    id: 'commerce',
    label: 'Store',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
  },
  {
    id: 'content',
    label: 'Marketing',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
];

const ALL_GROUPS = [
  {
    id: 'overview',
    workspace: 'overview',
    title: 'Executive Center',
    items: [
      { to: '/', label: 'Dashboard', end: true },
      { to: '/analytics', label: 'Analytics' },
      { to: '/reports', label: 'Financial Reports' },
    ],
  },
  {
    id: 'people',
    workspace: 'astrology',
    title: 'Astrologers & Users',
    items: [
      { to: '/astrologers', label: 'Astrologers Directory' },
      { to: '/new-entries', label: 'New Astrologers', badge: 'Review' },
      { to: '/customers', label: 'Customer Tracking', badge: 'Live' },
      { to: '/leaderboard', label: 'Earnings Leaderboard' },
      { to: '/reviews', label: 'Customer Reviews' },
      { to: '/withdrawals', label: 'Payout Requests' },
    ],
  },
  {
    id: 'services',
    workspace: 'astrology',
    title: 'Consultations & Live',
    items: [
      { to: '/sessions', label: 'Live Consultations' },
      { to: '/astro-services', label: 'Astro Services Rates' },
      { to: '/live', label: 'Live Video Streams' },
      { to: '/live-aarti', label: 'Live Aarti & Pooja' },
      { to: '/missed', label: 'Missed Calls' },
      { to: '/free-call-bookings', label: 'Free Intro Bookings' },
      { to: '/free-bot-chat', label: 'Bot Chatbot' },
      { to: '/guide-avatar', label: 'Guide Avatar AI' },
    ],
  },
  {
    id: 'commerce',
    workspace: 'commerce',
    title: 'Orders & Catalogues',
    items: [
      { to: '/orders', label: 'Customer Orders' },
      { to: '/remedies', label: 'App Remedies Store' },
      { to: '/wani-shop', label: 'Web Storefront' },
      { to: '/store-products', label: 'Store Products' },
      { to: '/gifts', label: 'Gifts & Rewards' },
    ],
  },
  {
    id: 'content',
    workspace: 'content',
    title: 'Promotions & Content',
    items: [
      { to: '/banners', label: 'App Home Banners' },
      { to: '/blogs', label: 'Astrology Articles' },
      { to: '/thoughts', label: 'Daily Thoughts' },
      { to: '/categories', label: 'Specialty Categories' },
      { to: '/notifications', label: 'Push Notifications' },
      { to: '/app-prompts', label: 'In-App Prompts' },
      { to: '/referral-popup', label: 'Referral Popups' },
    ],
  },
  {
    id: 'support',
    workspace: 'overview',
    title: 'Customer Care',
    items: [
      { to: '/support-inbox', label: 'Support Messages' },
      { to: '/support', label: 'Support Tickets' },
    ],
  },
];

export default function Layout() {
  const { admin, logout, isAuthed } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [activeWorkspace, setActiveWorkspace] = useState('all');
  const location = useLocation();

  if (!isAuthed) return <Navigate to="/login" replace />;

  const filteredGroups = useMemo(() => {
    let groups = ALL_GROUPS;

    if (search.trim()) {
      const q = search.toLowerCase();
      return groups.map((g) => ({
        ...g,
        items: g.items.filter((it) => it.label.toLowerCase().includes(q)),
      })).filter((g) => g.items.length > 0);
    }

    if (activeWorkspace !== 'all') {
      groups = groups.filter((g) => g.workspace === activeWorkspace || g.id === 'overview');
    }

    return groups;
  }, [activeWorkspace, search]);

  const currentItem = useMemo(() => {
    for (const g of ALL_GROUPS) {
      const match = g.items.find((item) =>
        item.end ? location.pathname === item.to : location.pathname.startsWith(item.to) && item.to !== '/'
      );
      if (match) return { group: g.title, label: match.label };
    }
    return { group: 'Executive Center', label: 'Dashboard' };
  }, [location.pathname]);

  return (
    <div className={`layout${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Brand Header */}
        <div className="brand-header">
          <div className="brand-logo-wrap">
            <div className="brand-icon-box">
              <svg className="brand-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6z" />
              </svg>
            </div>
            <div className="brand-text">
              <span className="brand-name">ASTROWANI</span>
              <span className="brand-sub">Admin Console</span>
            </div>
          </div>
        </div>

        {/* Workspace Switcher */}
        {!search && (
          <div className="workspace-bar">
            {WORKSPACES.map((ws) => (
              <button
                key={ws.id}
                className={`workspace-btn${activeWorkspace === ws.id ? ' active' : ''}`}
                onClick={() => setActiveWorkspace(ws.id)}
                title={`Switch to ${ws.label} workspace`}
              >
                {ws.icon}
                <span>{ws.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Live Navigation Filter */}
        <div className="sidebar-search">
          <svg className="search-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Search all tools… (⌘K)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear-search" onClick={() => setSearch('')}>×</button>
          )}
        </div>

        {/* Navigation List */}
        <nav className="sidebar-nav">
          {filteredGroups.length === 0 ? (
            <div className="empty-nav">No matching tools found</div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.id} className="nav-group">
                <div className="nav-group-header" style={{ cursor: 'default' }}>
                  <div className="nav-group-title">
                    <span>{group.title}</span>
                  </div>
                </div>
                <div className="nav-group-items">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                    >
                      <div className="nav-item-content">
                        <span className="nav-dot" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="nav-badge-pill">{item.badge}</span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))
          )}
        </nav>

        {/* User Footer */}
        <div className="sidebar-foot">
          <div className="user-profile">
            <div className="user-avatar">
              {(admin?.name || admin?.email || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <div className="user-email" title={admin?.email}>{admin?.email || 'admin@astrowani.com'}</div>
              <div className="user-role">Administrator</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout} title="Sign out">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
            <span>Exit</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="content-wrap">
        {/* Modern Sticky Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="toggle-btn"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label="Toggle Sidebar"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="breadcrumbs">
              <span className="breadcrumb-group">{currentItem.group}</span>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-current">{currentItem.label}</span>
            </div>
          </div>

          <div className="topbar-right">
            <div className="status-badge">
              <span className="pulse-dot" />
              <span>Production Live • Synchronized</span>
            </div>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
