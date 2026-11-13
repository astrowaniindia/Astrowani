import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import client from '../api/client';

// Two-factor login for this admin account (security audit 2026-11-13).
// Setup shows a NEW secret as a QR code; it only takes effect after a code from the
// authenticator app is confirmed, so a half-finished setup can never lock anyone out.
export default function Security() {
  const [enabled, setEnabled] = useState(null);
  const [setup, setSetup] = useState(null); // { secret, qr }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const { data } = await client.get('/api/admin/2fa/status');
      setEnabled(!!data.enabled);
    } catch (e) {
      setErr(e.response?.data?.message || e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const start = async () => {
    setErr(''); setMsg(''); setBusy(true);
    try {
      const { data } = await client.post('/api/admin/2fa/setup');
      const qr = await QRCode.toDataURL(data.otpauthUrl, { width: 220, margin: 1 });
      setSetup({ secret: data.secret, qr });
      setCode('');
    } catch (e) {
      setErr(e.response?.data?.message || e.message);
    } finally { setBusy(false); }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await client.post('/api/admin/2fa/enable', { code });
      setSetup(null); setCode(''); setEnabled(true);
      setMsg('Two-factor login is ON. You will be asked for a code every time you sign in.');
    } catch (e2) {
      setErr(e2.response?.data?.message || e2.message);
    } finally { setBusy(false); }
  };

  const turnOff = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await client.post('/api/admin/2fa/disable', { code });
      setCode(''); setEnabled(false);
      setMsg('Two-factor login is OFF.');
    } catch (e2) {
      setErr(e2.response?.data?.message || e2.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <h1 className="page-title">Security</h1>
      <div className="card" style={{ maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Two-factor login</h3>
        <p className="muted">
          Asks for a 6-digit code from an authenticator app (Google Authenticator, Microsoft
          Authenticator, 1Password …) after your password, so a leaked password alone is
          not enough to get into the dashboard.
        </p>

        {enabled === null && <p className="muted">Loading…</p>}

        {enabled === false && !setup && (
          <button className="btn" onClick={start} disabled={busy}>Turn on two-factor login</button>
        )}

        {setup && (
          <form onSubmit={confirm}>
            <p><b>1.</b> Scan this with your authenticator app.</p>
            <img src={setup.qr} alt="Two-factor setup QR code" width={220} height={220} />
            <p className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>
              Can&apos;t scan? Enter this key by hand: <code>{setup.secret}</code>
            </p>
            <p><b>2.</b> Type the 6-digit code it shows.</p>
            <div className="field">
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" required />
            </div>
            <button className="btn" disabled={busy || code.length !== 6}>Confirm and turn on</button>
          </form>
        )}

        {enabled === true && (
          <form onSubmit={turnOff}>
            <p style={{ color: '#1e8449', fontWeight: 600 }}>✓ Two-factor login is on for this account.</p>
            <p className="muted">To turn it off, enter a current code from your app.</p>
            <div className="field">
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" required />
            </div>
            <button className="btn btn-secondary" disabled={busy || code.length !== 6}>Turn off</button>
          </form>
        )}

        {msg && <p style={{ color: '#1e8449' }}>{msg}</p>}
        {err && <div className="error-text">{err}</div>}
      </div>
    </div>
  );
}
