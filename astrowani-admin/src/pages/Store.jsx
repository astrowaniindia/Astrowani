import { Link } from 'react-router-dom';

// Landing page for the "Astrowani Store" section — a set of cards, each opening one
// part of running the store. Deliberately just a router, not its own data: every card
// below either owns a page of its own (Products) or hands off to an existing one
// (Orders, Fulfilment Settings) rather than duplicating logic that already exists.
const SECTIONS = [
  {
    to: '/store/products',
    icon: '💎',
    title: 'Products',
    desc: 'The full catalog as editable cards — gemstones now, rudraksha and other categories as you add them. Add, edit, and activate items here.',
  },
  {
    to: '/orders',
    icon: '📦',
    title: 'Orders',
    desc: 'Every order placed in the store — status, payment, delivery address, and the fulfilment timeline.',
  },
  {
    to: '/remedies',
    icon: '⚙️',
    title: 'Fulfilment Settings',
    desc: 'Which categories are currently accepting orders, delivery/handling fees, and astrologer referral commission rates.',
  },
];

export default function Store() {
  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 6 }}>Astrowani Store</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 22, maxWidth: '62ch' }}>
        Everything for running the storefront — the product catalog, incoming orders, and
        the settings that control what's actually orderable — lives here.
      </p>
      <div className="nav-card-grid">
        {SECTIONS.map((s) => (
          <Link to={s.to} className="nav-card" key={s.to}>
            <div className="nav-card-icon">{s.icon}</div>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
