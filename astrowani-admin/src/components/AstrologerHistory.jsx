import { useEffect, useState } from 'react';
import client from '../api/client';
import ConsultationList, { Pager, rupees, fmt, TYPE_ICON } from './ConsultationList';
import { ChipGroup } from './filters';

// ─────────────────────────────────────────────────────────────────────────────
// One astrologer's complete history, opened from Astrologers Directory -> Details:
// every consultation, every wallet transaction and every withdrawal, each on its
// own tab, all time, one page at a time.
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'chat', label: '💬 Chat' },
  { key: 'audio', label: '📞 Audio' },
  { key: 'video', label: '🎥 Video' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'Any' },
  { key: 'paid', label: 'Earned > ₹0' },
  { key: 'zero', label: 'Earned ₹0' },
  { key: 'flagged', label: '🚩 Flagged' },
];

const TXN_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'credit', label: '⬆ Money in' },
  { key: 'debit', label: '⬇ Money out' },
];

const WITHDRAWAL_LABEL = {
  pending: { text: 'Pending', cls: 'amber' },
  approved: { text: 'Approved, not paid yet', cls: 'blue' },
  paid: { text: 'Paid', cls: 'green' },
  rejected: { text: 'Rejected (refunded)', cls: 'red' },
};

function SummaryTiles({ s }) {
  const tiles = [
    ['Wallet now', rupees(s.walletBalance), 'What they can withdraw today', 'var(--emerald)'],
    ['Earned, all time', rupees(s.credits), `${rupees(s.fromSessions)} from consultations${s.otherCredits > 0 ? ` + ${rupees(s.otherCredits)} other` : ''}`],
    ['Withdrawn', rupees(s.withdrawnPaid), s.withdrawPending > 0 ? `${rupees(s.withdrawPending)} waiting` : `${s.withdrawals} request${s.withdrawals === 1 ? '' : 's'}`],
    ['Consultations', Number(s.sessions || 0).toLocaleString('en-IN'), `${Number(s.paidSessions || 0).toLocaleString('en-IN')} earned money`],
    ['Transactions', Number(s.transactions || 0).toLocaleString('en-IN'), `${rupees(s.debits)} taken out in total`],
  ];
  return (
    <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 18 }}>
      {tiles.map(([label, value, foot, color]) => (
        <div className="stat" key={label} style={{ padding: '14px 18px' }}>
          <div className="label">{label}</div>
          <div className="value" style={{ fontSize: 24, marginTop: 4, color }}>{value}</div>
          <div className="stat-footer"><span className="muted" style={{ fontSize: 11.5 }}>{foot}</span></div>
        </div>
      ))}
    </div>
  );
}

function TransactionsTab({ astrologerId }) {
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, rows: [], total: 0, pages: 1 });

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => {
    let dead = false;
    setState((p) => ({ ...p, loading: true, error: null }));
    client.get(`/api/admin/astrologers/${astrologerId}/transactions`, {
      params: { page, limit: 50, type: filter === 'all' ? undefined : filter },
    })
      .then(({ data }) => { if (!dead) setState({ loading: false, rows: data.data || [], total: data.total || 0, pages: data.pages || 1 }); })
      .catch((e) => { if (!dead) setState({ loading: false, rows: [], total: 0, pages: 1, error: e.response?.data?.message || e.message }); });
    return () => { dead = true; };
  }, [astrologerId, filter, page]);

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <ChipGroup label="Show:" options={TXN_FILTERS} value={filter} onChange={setFilter} />
      </div>
      {state.error && <div style={{ color: 'var(--crimson)', marginBottom: 10 }}>{state.error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Customer</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {state.loading && state.rows.length === 0 && <tr><td colSpan={4} className="empty">Loading transactions…</td></tr>}
            {!state.loading && state.rows.length === 0 && <tr><td colSpan={4} className="empty">No transactions.</td></tr>}
            {state.rows.map((t) => {
              const credit = t.type === 'credit';
              return (
                <tr key={t.id} style={{ opacity: state.loading ? 0.5 : 1 }}>
                  <td className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmt(t.at)}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {t.sessionType && <span title={t.sessionType}>{TYPE_ICON[t.sessionType] || ''} </span>}
                      {t.description || (credit ? 'Credit' : 'Debit')}
                      {t.isFree && <span className="pill-badge" style={{ marginLeft: 6 }}>Free call</span>}
                    </div>
                    {t.withdrawalId && !/withdraw/i.test(t.description) && <div className="muted" style={{ fontSize: 11.5 }}>Withdrawal request</div>}
                  </td>
                  <td>{t.customer || <span className="muted">—</span>}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: credit ? '#059669' : 'var(--crimson)' }}>
                    {credit ? '+' : '−'}{rupees(t.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={state.pages} total={state.total} onPage={setPage} unit="transactions" />
    </>
  );
}

function WithdrawalsTab({ astrologerId }) {
  const [state, setState] = useState({ loading: true, rows: [] });
  useEffect(() => {
    let dead = false;
    client.get(`/api/admin/astrologers/${astrologerId}/withdrawals`)
      .then(({ data }) => { if (!dead) setState({ loading: false, rows: data.data || [] }); })
      .catch((e) => { if (!dead) setState({ loading: false, rows: [], error: e.response?.data?.message || e.message }); });
    return () => { dead = true; };
  }, [astrologerId]);

  return (
    <>
      {state.error && <div style={{ color: 'var(--crimson)', marginBottom: 10 }}>{state.error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Requested</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th style={{ textAlign: 'right' }}>TDS</th>
              <th style={{ textAlign: 'right' }}>Paid out</th>
              <th>Processed</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {state.loading && <tr><td colSpan={7} className="empty">Loading withdrawals…</td></tr>}
            {!state.loading && state.rows.length === 0 && <tr><td colSpan={7} className="empty">No withdrawal requests yet.</td></tr>}
            {state.rows.map((w) => {
              const st = WITHDRAWAL_LABEL[w.status] || { text: w.status, cls: '' };
              return (
                <tr key={w.id}>
                  <td className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmt(w.requested_at)}</td>
                  <td><span className={`badge ${st.cls}`}><span className="badge-dot" /> {st.text}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{rupees(w.amount)}</td>
                  <td style={{ textAlign: 'right' }} className="muted">{w.tds_amount != null ? rupees(w.tds_amount) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{w.net_amount != null ? rupees(w.net_amount) : '—'}</td>
                  <td className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmt(w.processed_at)}</td>
                  <td style={{ fontSize: 12.5, maxWidth: 260, wordBreak: 'break-word' }}>{w.admin_note || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Bank and UPI details are on the Payout Requests page, where withdrawals are approved and paid.
      </p>
    </>
  );
}

export default function AstrologerHistory({ astrologerId, initialTab = 'consultations' }) {
  const [tab, setTab] = useState(initialTab);
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let dead = false;
    setSummary(null);
    client.get(`/api/admin/astrologers/${astrologerId}/history-summary`)
      .then(({ data }) => { if (!dead) setSummary(data.data); })
      .catch((e) => { if (!dead) setSummaryError(e.response?.data?.message || e.message); });
    return () => { dead = true; };
  }, [astrologerId]);

  const tabs = [
    ['consultations', `🗂️ Consultations${summary ? ` (${Number(summary.sessions).toLocaleString('en-IN')})` : ''}`],
    ['transactions', `💳 Transactions${summary ? ` (${Number(summary.transactions).toLocaleString('en-IN')})` : ''}`],
    ['withdrawals', `🏦 Withdrawals${summary ? ` (${summary.withdrawals})` : ''}`],
  ];

  return (
    <div>
      {summaryError && <div style={{ color: 'var(--crimson)', marginBottom: 10 }}>{summaryError}</div>}
      {summary && <SummaryTiles s={summary} />}

      <div className="btn-group" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {tabs.map(([key, label]) => (
          <button key={key} className={`btn sm ${tab === key ? '' : 'secondary'}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'consultations' && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <ChipGroup label="Type:" options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />
            <ChipGroup label="Show:" options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
            <div className="search-bar-wrap" style={{ marginLeft: 'auto' }}>
              <span className="search-bar-icon">🔍</span>
              <input type="text" placeholder="Search customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          {/* includeTest: this is one astrologer's own record, so it shows everything
              they did, including sessions with the store-reviewer account. */}
          <ConsultationList
            astrologerId={astrologerId}
            windowKey="all"
            includeTest
            typeFilter={typeFilter}
            statusFilter={statusFilter}
            search={search}
            hideAstrologerColumn
          />
        </>
      )}
      {tab === 'transactions' && <TransactionsTab astrologerId={astrologerId} />}
      {tab === 'withdrawals' && <WithdrawalsTab astrologerId={astrologerId} />}
    </div>
  );
}
