import { isSignedIn, getUser, onAuthChange } from './session.js?v=55';
import { requireSignIn } from './auth.js?v=55';
import { fetchBalance, cachedBalance, onWalletChange } from './wallet.js?v=55';
import { esc } from './ui.js?v=55';

/**
 * The nav. "Login / Sign up" becomes the live wallet balance and an account
 * link once signed in. Every page has these two links, so this rewrites them in
 * place rather than each page knowing anything about auth.
 *
 * Signing in is the one popup in the product (the owner's rule); everything it
 * leads to — wallet, history, consultations — is a real page.
 */

function navTargets() {
  // Two nav variants exist: the homepage floating pill (.ch-nav-*) and the
  // ordinary sticky nav everywhere else.
  //
  // The sign-up button is found by its Play Store href, which this code then
  // REWRITES — so it is tagged on first sight and matched by that tag forever
  // after. Without the tag the second paint finds nothing and the button stays
  // reading "Sign up" for an already signed-in visitor.
  document.querySelectorAll('.btn-gold.magnetic[href*="play.google.com"]').forEach((el) => {
    el.dataset.awNavSignup = '1';
  });
  return {
    logins: Array.from(document.querySelectorAll('.nav-login, .ch-nav-login')),
    signups: Array.from(document.querySelectorAll('[data-aw-nav-signup]')),
  };
}

function paintNav() {
  const { logins, signups } = navTargets();
  const signed = isSignedIn();
  const user = getUser();
  const balance = cachedBalance();

  logins.forEach((el) => {
    if (!signed) {
      el.textContent = 'Login';
      el.setAttribute('href', '#');
      el.dataset.awAction = 'signin';
      return;
    }
    delete el.dataset.awAction;
    el.setAttribute('href', 'wallet.html');
    el.innerHTML = `<span class="aw-nav-balance">₹${balance == null ? '…' : esc(balance)}</span>`;
  });

  signups.forEach((el) => {
    if (!signed) {
      el.textContent = 'Sign up';
      el.setAttribute('href', '#');
      el.dataset.awAction = 'signin';
      return;
    }
    delete el.dataset.awAction;
    el.setAttribute('href', 'wallet.html');
    const name = (user?.name || '').trim();
    el.textContent = name ? name.split(' ')[0] : 'My account';
  });
}

export function wireAccountUi() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-aw-action="signin"]');
    if (!el) return;
    e.preventDefault();
    requireSignIn();
  });

  onAuthChange(paintNav);
  onWalletChange(paintNav);
  paintNav();
  if (isSignedIn()) fetchBalance();
}
