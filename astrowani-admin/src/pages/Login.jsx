import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Shown once the server answers TOTP_REQUIRED for an admin with two-factor on.
  const [needTotp, setNeedTotp] = useState(false);
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password, needTotp ? totp : undefined);
      navigate('/');
    } catch (err) {
      if (err.response?.data?.code === 'TOTP_REQUIRED') {
        setNeedTotp(true);
        setError('');
        return;
      }
      if (err.response?.data?.code === 'TOTP_INVALID') setTotp('');
      setError(err.response?.data?.message || err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Astrowani Admin</h1>
        <p>Sign in to manage the platform</p>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {needTotp && (
          <div className="field">
            <label>Authenticator code</label>
            <input
              inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required
              value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code"
            />
          </div>
        )}
        <button className="btn" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <div className="error-text">{error}</div>}
      </form>
    </div>
  );
}
