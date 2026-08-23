import { Link } from 'react-router-dom';

// Landing page for the "Astrowani Store" section — its own catalog (store_products
// table), completely separate from the Remedies Shop / remedy_items. No customer-facing
// screen reads this data yet; it exists so the products can be organised here first.
export default function Store() {
  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 6 }}>Astrowani Store</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 22, maxWidth: '62ch' }}>
        A separate catalog for the store — gemstones, rudraksha, and everything else you
        add here. This is its own table, independent of the Remedies Shop, so nothing
        here reaches the live customer app until a screen is built to show it.
      </p>
      <div className="nav-card-grid">
        <Link to="/store-products" className="nav-card">
          <div className="nav-card-icon">💎</div>
          <h3>Products</h3>
          <p>The full catalog as editable cards — gemstones now, rudraksha and other categories as you add them.</p>
        </Link>
      </div>
    </div>
  );
}
