import { api, ApiError } from './api.js?v=17';
import { signIn, isSignedIn, getUser, getToken } from './session.js?v=17';
import { createOverlay, toast, esc } from './ui.js?v=17';

/**
 * Sign-in / sign-up in one popup: phone -> OTP -> (name, only for a brand new
 * account). Nothing else is asked for, per the owner's spec.
 *
 * THE WHOLE POINT OF THIS FLOW IS THAT IT IS THE SAME ACCOUNT AS THE APP.
 * `/api/users/mobile-otp-verify` canonicalises the number and looks up (or
 * creates) the one row in `customers` keyed by it, so a visitor who recharges
 * here and later installs the app with the same number finds the same wallet,
 * the same history and the same balance. There is no web-specific account and
 * there must never be one.
 *
 * `intent` is deliberately NOT sent. The backend uses it to refuse a login for a
 * number with no account (and vice versa); this popup is a single "continue with
 * your phone number" door, so either outcome is correct here and the backend's
 * permissive path is the one we want.
 */

let openPromise = null;

/**
 * Open the sign-in popup. Resolves true once signed in, false if dismissed.
 * Calling it while already signed in resolves immediately.
 *
 * Concurrent callers share one popup — two buttons racing (e.g. a wallet check
 * and a chat button) must not stack two dialogs.
 */
export function requireSignIn({ reason } = {}) {
  if (isSignedIn()) return Promise.resolve(true);
  if (openPromise) return openPromise;

  openPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      openPromise = null;
      resolve(ok);
    };

    const { body, close } = createOverlay({
      className: 'aw-auth',
      onClose: () => finish(isSignedIn()),
    });

    let phone = '';
    let step = 'phone';
    let busy = false;
    let resendAt = 0;
    let resendTimer = null;

    function render() {
      if (step === 'phone') {
        body.innerHTML = `
          <div class="aw-card">
            <button type="button" class="aw-close" data-act="close" aria-label="Close">&times;</button>
            <h3 class="aw-card-title">Continue with your mobile</h3>
            <p class="aw-card-text">${esc(reason || 'Enter your number and we will send you a one-time password.')}</p>
            <form class="aw-form" data-act="send">
              <label class="aw-field">
                <span class="aw-field-label">Mobile number</span>
                <div class="aw-phone-input">
                  <span class="aw-phone-cc">+91</span>
                  <input type="tel" name="phone" inputmode="numeric" autocomplete="tel"
                         maxlength="10" placeholder="98765 43210" value="${esc(phone)}" required>
                </div>
              </label>
              <p class="aw-error" data-err hidden></p>
              <button type="submit" class="aw-btn aw-btn-gold aw-btn-block">Send OTP</button>
              <p class="aw-fineprint">By continuing you agree to our
                <a href="https://astrowani.com/term_conditions/" target="_blank" rel="noopener">Terms</a> and
                <a href="https://astrowani.com/privacy-policy/" target="_blank" rel="noopener">Privacy Policy</a>.</p>
            </form>
          </div>`;
      } else {
        body.innerHTML = `
          <div class="aw-card">
            <button type="button" class="aw-close" data-act="close" aria-label="Close">&times;</button>
            <h3 class="aw-card-title">Enter the OTP</h3>
            <p class="aw-card-text">Sent to +91 ${esc(phone)} &middot;
              <button type="button" class="aw-linkbtn" data-act="change">change</button></p>
            <form class="aw-form" data-act="verify">
              <label class="aw-field">
                <span class="aw-field-label">6-digit OTP</span>
                <input type="text" name="otp" inputmode="numeric" autocomplete="one-time-code"
                       maxlength="6" placeholder="------" class="aw-otp-input" required>
              </label>
              <label class="aw-field" data-name-field hidden>
                <span class="aw-field-label">Your name</span>
                <input type="text" name="name" autocomplete="name" placeholder="Your name">
              </label>
              <p class="aw-error" data-err hidden></p>
              <button type="submit" class="aw-btn aw-btn-gold aw-btn-block">Verify &amp; continue</button>
              <button type="button" class="aw-linkbtn aw-resend" data-act="resend"></button>
            </form>
          </div>`;
        paintResend();
      }
      wire();
    }

    function paintResend() {
      const btn = body.querySelector('[data-act="resend"]');
      if (!btn) return;
      const left = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      if (left > 0) {
        btn.textContent = `Resend OTP in ${left}s`;
        btn.disabled = true;
      } else {
        btn.textContent = 'Resend OTP';
        btn.disabled = false;
      }
    }

    function showError(msg) {
      const el = body.querySelector('[data-err]');
      if (!el) return;
      el.textContent = msg;
      el.hidden = !msg;
    }

    function setBusy(next, label) {
      busy = next;
      const btn = body.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = next;
        btn.dataset.idle = btn.dataset.idle || btn.textContent;
        btn.textContent = next ? (label || 'Please wait…') : btn.dataset.idle;
      }
    }

    async function sendOtp(nextPhone) {
      if (busy) return;
      const digits = String(nextPhone || '').replace(/\D/g, '').slice(-10);
      if (digits.length !== 10) {
        showError('Please enter a valid 10-digit mobile number.');
        return;
      }
      phone = digits;
      showError('');
      setBusy(true, 'Sending…');
      try {
        await api.post('/api/users/mobile-otp-request', { phoneNumber: phone }, { auth: false });
        step = 'otp';
        // Cleared BEFORE the re-render, not via setBusy: render() replaces the
        // card, so setBusy would be re-enabling a button that no longer exists
        // while the flag stayed true — which silently made the verify submit a
        // no-op (`if (busy) return`) and looked like a dead button.
        busy = false;
        resendAt = Date.now() + 30000;
        render();
        clearInterval(resendTimer);
        resendTimer = setInterval(() => {
          if (!document.body.contains(body)) return clearInterval(resendTimer);
          paintResend();
        }, 1000);
        body.querySelector('input[name="otp"]')?.focus();
      } catch (err) {
        setBusy(false);
        showError(err instanceof ApiError ? err.message : 'Could not send the OTP. Please try again.');
      }
    }

    async function verifyOtp(otp, name) {
      if (busy) return;
      const code = String(otp || '').replace(/\D/g, '');
      if (code.length < 4) {
        showError('Please enter the OTP you received.');
        return;
      }
      showError('');
      setBusy(true, 'Verifying…');
      try {
        const payload = { phoneNumber: phone, otp: code };
        // Only sent when the visitor actually typed one — see the name-field
        // reveal below, which appears after the backend says this is a new account.
        if (name) payload.name = name;
        const res = await api.post('/api/users/mobile-otp-verify', payload, { auth: false });
        if (!res?.token) throw new ApiError(res?.message || 'Could not sign you in.');

        signIn(res.token, {
          id: res.user?.id,
          phoneNumber: res.user?.phoneNumber || phone,
          name: name || getUser()?.name || '',
        });

        // A brand-new account has no name yet. Rather than a second dialog, the
        // name field is revealed in place and the verify is repeated — but the
        // OTP is already consumed by then, so instead we capture it here and
        // patch the profile separately.
        if (res.isNewAccount && !name) {
          setBusy(false);
          const field = body.querySelector('[data-name-field]');
          const otpField = body.querySelector('input[name="otp"]')?.closest('.aw-field');
          if (field) {
            field.hidden = false;
            if (otpField) otpField.hidden = true;
            body.querySelector('.aw-card-title').textContent = 'What should we call you?';
            body.querySelector('.aw-card-text').textContent = 'Almost done — just your name.';
            body.querySelector('[data-act="resend"]')?.remove();
            body.querySelector('button[type="submit"]').textContent = 'Finish';
            body.querySelector('button[type="submit"]').dataset.idle = 'Finish';
            body.querySelector('input[name="name"]').focus();
            body.dataset.awaitingName = '1';
          } else {
            toast('Signed in.');
            close();
          }
          return;
        }

        toast(`Welcome${name ? `, ${name}` : ''}!`);
        finish(true);
        close();
      } catch (err) {
        setBusy(false);
        showError(err instanceof ApiError ? err.message : 'Could not verify that OTP.');
      }
    }

    async function saveName(name) {
      const clean = String(name || '').trim();
      if (!clean) {
        showError('Please tell us your name.');
        return;
      }
      setBusy(true, 'Saving…');
      try {
        await api.put('/api/users/profile', { name: clean });
      } catch (_) {
        // A name that would not save must not strand a visitor who is already
        // signed in — the account exists and works; the name can be set later.
      }
      const u = getUser() || {};
      signIn(getToken(), { ...u, name: clean });
      toast(`Welcome, ${clean}!`);
      finish(true);
      close();
    }

    function wire() {
      body.querySelector('[data-act="close"]')?.addEventListener('click', () => {
        finish(isSignedIn());
        close();
      });
      body.querySelector('[data-act="change"]')?.addEventListener('click', () => {
        step = 'phone';
        render();
      });
      body.querySelector('[data-act="resend"]')?.addEventListener('click', () => sendOtp(phone));

      const sendForm = body.querySelector('form[data-act="send"]');
      if (sendForm) {
        sendForm.addEventListener('submit', (e) => {
          e.preventDefault();
          sendOtp(new FormData(sendForm).get('phone'));
        });
      }

      const verifyForm = body.querySelector('form[data-act="verify"]');
      if (verifyForm) {
        verifyForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const data = new FormData(verifyForm);
          if (body.dataset.awaitingName === '1') {
            saveName(data.get('name'));
          } else {
            verifyOtp(data.get('otp'), '');
          }
        });
      }
    }

    render();
    body.querySelector('input[name="phone"]')?.focus();
  });

  return openPromise;
}
