import { esc, toast } from './ui.js?v=37';
import { isSignedIn, getUser, signOut, onAuthChange } from './session.js?v=37';
import { requireSignIn } from './auth.js?v=37';
import { fetchBalance, fetchTransactions, startRecharge, onWalletChange, cachedBalance } from './wallet.js?v=37';

/**
 * wallet.html — balance, add money, and the full transaction history.
 *
 * The history shown here is the SAME ledger the app shows, already folded
 * server-side so a ten-minute call is one row rather than ten per-minute
 * debits. There is no web-only wallet to reconcile: both clients read the one
 * balance on the customers row, keyed by phone number.
 */

const el = (id) => document.getElementById(id);
const PRESETS = [100, 200, 500, 1000, 2000, 5000];

export async function initWalletPage() {
  const gate = el('aw-wallet-gate');
  const body = el('aw-wallet-body');

  if (!isSignedIn()) {
    gate.hidden = false;
    body.hidden = true;
    el('aw-wallet-signin').addEventListener('click', async () => {
      const ok = await requireSignIn({ reason: 'Sign in to see your wallet.' });
      if (ok) location.reload();
    });
    return;
  }

  gate.hidden = true;
  body.hidden = false;

  const user = getUser() || {};
  el('aw-wallet-who').textContent = user.name ? `${user.name} · +91 ${user.phoneNumber || ''}` : `+91 ${user.phoneNumber || ''}`;

  el('aw-amount-grid').innerHTML = PRESETS
    .map((a) => `<button type="button" class="aw-amount" data-amt="${a}">₹${a}</button>`)
    .join('');

  el('aw-amount-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.aw-amount');
    if (!btn) return;
    el('aw-amount-grid').querySelectorAll('.aw-amount').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    el('aw-amount-input').value = btn.dataset.amt;
  });

  el('aw-recharge-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(el('aw-amount-input').value);
    const err = el('aw-recharge-error');
    const submit = e.currentTarget.querySelector('button[type="submit"]');
    if (!Number.isFinite(amount) || amount < 10) {
      err.textContent = 'Please enter an amount of ₹10 or more.';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Starting payment…';
    const result = await startRecharge(amount);
    submit.disabled = false;
    submit.textContent = 'Proceed to pay';
    if (result.ok) {
      toast(`₹${amount} added to your wallet.`, { kind: 'success' });
      paintBalance();
      loadHistory();
    } else if (result.message) {
      err.textContent = result.message;
      err.hidden = false;
    }
  });

  el('aw-wallet-signout').addEventListener('click', () => {
    signOut();
    toast('Signed out.');
    setTimeout(() => { window.location.href = 'index.html'; }, 600);
  });

  onWalletChange(paintBalance);
  onAuthChange(() => location.reload());

  paintBalance();
  await fetchBalance({ force: true });
  paintBalance();
  loadHistory();
}

function paintBalance() {
  const b = el('aw-wallet-balance');
  if (!b) return;
  const v = cachedBalance();
  b.textContent = v == null ? '…' : `₹${v}`;
}

async function loadHistory() {
  const list = el('aw-history-list');
  list.innerHTML = '<div class="aw-chat-sys">Loading…</div>';
  const rows = await fetchTransactions();
  if (!rows.length) {
    list.innerHTML = '<div class="aw-chat-sys">No transactions yet. Add money to get started.</div>';
    return;
  }
  list.innerHTML = rows.map((t) => {
    const credit = Number(t.amount) >= 0;
    return `<div class="aw-history-row">
      <div class="aw-history-main">
        <div class="aw-history-desc">${esc(t.description)}</div>
        <div class="aw-history-date">${esc(t.date)}${t.minutesBilled ? ` · ${esc(t.minutesBilled)} min` : ''}</div>
      </div>
      <div class="aw-history-amt ${credit ? 'is-credit' : 'is-debit'}">${credit ? '+' : '−'}₹${esc(Math.abs(Number(t.amount)))}</div>
    </div>`;
  }).join('');
}
