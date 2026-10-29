import { api } from './api.js?v=56';
import { getSocket, joinSessionWithRetry } from './socket.js?v=56';
import { toast, esc, confirmDialog } from './ui.js?v=56';
import { isSignedIn, getUser } from './session.js?v=56';
import { requireSignIn } from './auth.js?v=56';
import { fetchBalance, ensureFunds } from './wallet.js?v=56';
import { findAstrologer, onRosterChange, refresh as refreshRoster } from './astrologers.js?v=56';
import { requestConsultation, RequestClosed } from './request.js?v=56';
import { trackViewportHeight, keepScrolledToLatest } from './mobile.js?v=56';
import { attachChatImages, captionOf, openLightbox } from './chat-image.js?v=56';
import { track } from './analytics.js?v=56';

/**
 * chat.html — the chat consultation screen.
 *
 * Owns the whole flow: sign in, check funds, ring the astrologer, then run the
 * conversation. Reached as `chat.html?astrologer=<id>` for a new consultation
 * or `chat.html?session=<id>` to rejoin one already running.
 *
 * Messages go out over HTTP and come back over the session socket room — the
 * same split the app uses. It is deliberate: because sending does not depend on
 * the socket, a chat keeps working while the socket is down, which is exactly
 * how a production outage once hid for a whole evening (CLAUDE.md DO). Hence
 * the retrying session join and the `signal_connection` re-emit below.
 */

const el = (id) => document.getElementById(id);

export async function initChatPage() {
  // Phone first: the composer has to stay above the keyboard for the whole
  // consultation, on iOS as well as Android.
  trackViewportHeight();

  const params = new URLSearchParams(location.search);
  const astrologerId = params.get('astrologer');
  const resumeSession = params.get('session');

  const stage = el('aw-chat-stage');
  const room = el('aw-chat-room');

  function setStage(title, detail, { cancel, showHome } = {}) {
    room.hidden = true;
    stage.hidden = false;
    stage.innerHTML = `
      <div class="aw-stage-card">
        <div class="aw-stage-spinner" ${cancel ? '' : 'hidden'}></div>
        <h2 class="aw-stage-title">${esc(title)}</h2>
        <p class="aw-stage-text">${esc(detail || '')}</p>
        ${cancel ? '<button type="button" class="aw-btn aw-btn-ghost" data-act="cancel">Cancel</button>' : ''}
        ${showHome ? '<a class="aw-btn aw-btn-gold" href="astrologers.html">Back to astrologers</a>' : ''}
      </div>`;
    if (cancel) stage.querySelector('[data-act="cancel"]').addEventListener('click', cancel);
  }

  if (!isSignedIn()) {
    setStage('Sign in to start your chat', 'Your wallet and chat history follow your mobile number across the website and the app.');
    const ok = await requireSignIn({ reason: 'Sign in to start your chat.' });
    if (!ok) {
      setStage('Sign in to continue', 'You need to be signed in to chat with an astrologer.', { showHome: true });
      return;
    }
  }

  // Resume path: rejoin an already-running session (a refresh, or a chat
  // started in the app).
  if (resumeSession) {
    const info = await lookupActiveSession();
    if (!info || String(info.sessionId) !== String(resumeSession)) {
      setStage('That chat has ended', 'It is no longer active.', { showHome: true });
      return;
    }
    const astro = await resolveAstrologer(info.astrologerId, info);
    runChat({ sessionId: info.sessionId, requestId: info.requestId, astro, rate: Number(info.perMinuteCharge) || 0 });
    return;
  }

  if (!astrologerId) {
    setStage('No astrologer selected', 'Pick an astrologer to start a chat.', { showHome: true });
    return;
  }

  setStage('Getting ready…', 'Checking the astrologer is free.');
  if (!findAstrologer(astrologerId)) await refreshRoster();
  const astro = findAstrologer(astrologerId);
  if (!astro) {
    setStage('Astrologer unavailable', 'We could not find that astrologer.', { showHome: true });
    return;
  }

  paintPeer(astro);

  const rate = astro.chat || 0;
  const funded = await ensureFunds({ rate, minutes: 5, label: 'chat' });
  if (!funded) {
    setStage('Not enough balance', `You need at least ₹${rate * 5} to start a chat with ${astro.name}.`, { showHome: true });
    return;
  }

  let cancelRequest = null;
  setStage(`Connecting you to ${astro.name}`, 'Sending your chat request…', {
    cancel: () => cancelRequest && cancelRequest('Request cancelled.'),
  });

  try {
    track('chat_initiated', { astrologer_id: astro.id, rate });
    const { sessionId, requestId } = await requestConsultation({
      kind: 'chat',
      astrologer: astro,
      onStatus: (text, { cancel }) => {
        cancelRequest = cancel;
        const t = stage.querySelector('.aw-stage-text');
        if (t) t.textContent = text;
      },
    });
    runChat({ sessionId, requestId, astro, rate });
  } catch (err) {
    // Reuses the app's `consult_blocked` rather than inventing a name, so the
    // gap between chat_initiated and chat_started has a reason attached to it:
    // a request that was cancelled, declined or timed out otherwise looks
    // identical to a visitor who closed the tab.
    if (err instanceof RequestClosed) {
      track('consult_blocked', { mode: 'chat', astrologer_id: astro.id, reason: 'request_closed' });
      setStage('Chat not started', err.message, { showHome: true });
    } else {
      track('consult_blocked', { mode: 'chat', astrologer_id: astro.id, reason: 'error' });
      setStage('Something went wrong', 'Please try again in a moment.', { showHome: true });
    }
  }
}

async function lookupActiveSession() {
  try {
    const res = await api.get('/api/customer/active-session');
    return res?.chat || null;
  } catch (_) {
    return null;
  }
}

function resolveAstrologer(id, info) {
  const found = findAstrologer(id);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; off(); clearTimeout(t); resolve(v); } };
    const off = onRosterChange(() => { const f = findAstrologer(id); if (f) finish(f); });
    const t = setTimeout(() => finish({
      id,
      name: info?.astrologerName || 'Astrologer',
      photoUrl: info?.astrologerImage || '',
      photo: `${id}.jpg`,
    }), 2500);
    refreshRoster();
  });
}

function paintPeer(astro) {
  const img = el('aw-peer-avatar');
  if (img) img.src = astro.photoUrl || `assets/astrologers/${astro.photo}`;
  const name = el('aw-peer-name');
  if (name) name.textContent = astro.name;
}

/**
 * The opening "here are my details" message, auto-sent to the astrologer.
 *
 * Mirrors sendCustomerDetails() in the customer app's ChatSessionScreen. Without
 * it the consultation starts with the astrologer asking for a birth date by
 * hand, which is exactly what the app added this to stop.
 *
 * MUST match the app's wording character for character: the same session can be
 * continued in the app, and the "already sent?" guard on both sides is a
 * substring test against this marker. The leading emoji is deliberately NOT part
 * of the marker — it has to match rows already in the database, and plain ASCII
 * cannot be broken by an encoding difference.
 */
const DETAILS_MARKER = 'Namaste! Here are my details for the reading:';

function formatDob(d) {
  if (!d) return 'Not provided';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) {
    return String(d);
  }
}

async function buildDetailsMessage(fallbackName) {
  let prof = null;
  try {
    // Never read the customers table directly — that is the whole point of this
    // endpoint existing (it resolves "my own profile" from the JWT).
    const res = await api.get('/api/users/profile');
    prof = res?.data || null;
  } catch (_) {
    // Fall through: a details message with "Not provided" still beats none.
  }
  return `🙏 ${DETAILS_MARKER}\n\n`
    + `Full Name: ${prof?.name || fallbackName || 'Not provided'}\n`
    + `Date of Birth: ${formatDob(prof?.dob)}\n`
    + `Time of Birth: ${prof?.timeOfBirth || 'Not provided'}\n`
    + `Place of Birth: ${prof?.placeOfBirth || 'Not provided'}`;
}

/**
 * The admin-authored in-session banner ("Your first minute is on us…"), the web
 * twin of the app's SessionIntroBanner. Same self-dismiss window, same
 * fails-to-hidden rule: if the copy cannot be read we show nothing rather than
 * inventing a sentence no admin approved.
 */
const BANNER_DISMISS_AFTER_MS = 25000;

async function mountIntroBanner(room, log) {
  let info = null;
  try {
    const lang = document.documentElement.getAttribute('data-lang') === 'hi' ? 'hi' : 'en';
    info = await api.get(`/api/session-intro-banner?language=${lang}`);
  } catch (_) {
    return;
  }
  if (!info?.enabled || !info.text) return;

  const bar = document.createElement('div');
  bar.className = 'aw-chat-banner';
  bar.innerHTML = `<span class="aw-chat-banner-icon" aria-hidden="true">&#128161;</span>
    <span class="aw-chat-banner-text"></span>
    <button type="button" class="aw-chat-banner-close" aria-label="Dismiss">&times;</button>`;
  bar.querySelector('.aw-chat-banner-text').textContent = info.text;

  const remove = () => bar.remove();
  bar.querySelector('.aw-chat-banner-close').addEventListener('click', remove);
  // Above the log, not inside it: inside, it scrolls away with the conversation
  // and it is also the first thing a "scroll to latest" jump skips past.
  room.insertBefore(bar, log);
  setTimeout(remove, BANNER_DISMISS_AFTER_MS);
}

function runChat({ sessionId, requestId, astro, rate }) {
  const stage = el('aw-chat-stage');
  const room = el('aw-chat-room');
  const log = el('aw-chat-log');
  const meta = el('aw-peer-meta');
  const form = el('aw-chat-form');
  const input = el('aw-chat-input');

  paintPeer(astro);
  stage.hidden = true;
  room.hidden = false;
  input.focus();

  const me = getUser();
  const myId = me?.id ? String(me.id) : null;
  const seen = new Set();
  const roomId = requestId || sessionId;

  let socket = null;
  let joinHandle = null;
  let detachImages = null;
  let announce = null;
  let ended = false;
  let timer = null;
  const startedAt = Date.now();

  track('chat_started', { astrologer_id: astro.id, rate });

  function addMessage(row) {
    const id = row.id ? String(row.id) : null;
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    const mine = myId && String(row.sender_id) === myId;
    const div = document.createElement('div');
    div.className = `aw-msg ${mine ? 'is-mine' : 'is-theirs'}`;
    const when = row.created_at ? new Date(row.created_at) : new Date();
    const time = `<div class="aw-msg-time">${when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div>`;

    // A photo. An older row — or one written by a build that predates photos —
    // has no message_type and falls through to the text bubble exactly as before.
    if (row.message_type === 'image' && row.image_url) {
      const caption = captionOf(row.message);
      // The aspect ratio comes from the ROW, not from the decoded image, so the
      // bubble takes up its final shape before the photo has loaded. Without it
      // every photo arriving mid-conversation shoves the log up or down and
      // whatever the other person was reading jumps off the screen.
      const w = Number(row.image_width) || 4;
      const h = Number(row.image_height) || 3;
      div.classList.add('aw-msg-img');
      div.innerHTML = `<button type="button" class="aw-msg-photo" style="aspect-ratio:${w} / ${h}">
          <img src="${esc(row.image_url)}" alt="${caption ? esc(caption) : 'Photo'}" loading="lazy">
        </button>
        ${caption ? `<div class="aw-msg-text">${esc(caption)}</div>` : ''}
        ${time}`;
      const btn = div.querySelector('.aw-msg-photo');
      btn.addEventListener('click', () => openLightbox(row.image_url));
      // A photo that will not load leaves something tappable rather than an
      // invisible gap that reads as "they never sent anything".
      div.querySelector('img').addEventListener('error', () => btn.classList.add('is-broken'));
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
      return;
    }

    div.innerHTML = `<div class="aw-msg-text">${esc(row.message)}</div>
      ${time}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function addSystem(text) {
    const d = document.createElement('div');
    d.className = 'aw-chat-sys';
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function paintTimer() {
    if (ended) return;
    const s = Math.floor((Date.now() - startedAt) / 1000);
    meta.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} · ₹${rate}/min`;
  }

  async function send(text) {
    const message = String(text || '').trim();
    if (!message || ended) return;
    input.value = '';
    try {
      const res = await api.post('/api/chat/message', { roomId, sessionId, receiverId: astro.id, message });
      if (res?.data) addMessage(res.data);
      // The server masks phone numbers, emails, UPI ids and links before storing.
      // Only the SENDER is told — the owner's rule is that a warning goes to
      // whoever tried, never to both sides at once.
      if (res?.masked) addSystem('Contact details are hidden. Please keep the conversation on Astrowani.');
    } catch (err) {
      addSystem('That message could not be sent. Please try again.');
      input.value = message;
    }
  }

  function teardown() {
    ended = true;
    clearInterval(timer);
    detachImages?.();
    joinHandle?.stop();
    if (socket) {
      socket.off('new_chat_message', onIncoming);
      socket.off('session_ended', onEnded);
      if (announce) socket.off('connect', announce);
    }
  }

  function onIncoming(row) {
    if (!row || (row.session_id && String(row.session_id) !== String(sessionId))) return;
    addMessage(row);
  }

  function leave(message) {
    track('chat_ended', {
      astrologer_id: astro.id,
      duration_seconds: Math.round((Date.now() - startedAt) / 1000),
    });
    teardown();
    fetchBalance({ force: true });
    sessionStorage.setItem('aw_flash', message);
    window.location.href = 'astrologers.html';
  }

  function onEnded(data) {
    if (data?.sessionId && String(data.sessionId) !== String(sessionId)) return;
    if (ended) return;
    leave(data?.reason === 'insufficient_balance'
      ? 'Your balance ran out, so the chat ended.'
      : 'The chat has ended.');
  }

  el('aw-chat-end').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'End this chat?',
      message: 'Billing stops as soon as the chat ends.',
      confirmLabel: 'End chat',
      cancelLabel: 'Keep chatting',
    });
    if (ok !== true || ended) return;
    ended = true;
    // ALWAYS the real end endpoint — this is what finalises billing.
    try { await api.post('/api/call/end', { sessionId }); } catch (_) {}
    leave('Chat ended.');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });

  // Photo attachments: crop, draw and write on it, then POST /api/chat/image.
  // The saved row is added here exactly as the socket would add it (deduped by id
  // in addMessage), so the sender sees their own photo even mid-reconnect.
  detachImages = attachChatImages({
    button: el('aw-chat-attach'),
    roomId,
    sessionId,
    receiverId: astro.id,
    onMessage: addMessage,
    onSystem: addSystem,
    canSend: () => !ended,
  });

  (async () => {
    let history = null;
    try {
      const res = await api.get(`/api/chat/messages?sessionId=${encodeURIComponent(sessionId)}`);
      history = res?.data || [];
      history.forEach(addMessage);
    } catch (_) {
      // History is not worth failing the session over; live messages still arrive.
    }

    mountIntroBanner(room, log);

    try {
      socket = await getSocket();
      joinHandle = joinSessionWithRetry(socket, sessionId, { label: 'Web/Chat' });

      // ACTIVATES THE SESSION. Without this the row stays is_active = false and
      // the backend rejects every message with 409 SESSION_ENDED — the chat looks
      // connected and is completely mute. Both apps emit this for chat; it is not
      // the astrologer's job alone. Re-emitted on reconnect, like the room join.
      announce = () => socket.emit('signal_connection', { sessionId });
      announce();
      socket.on('connect', announce);
      socket.on('new_chat_message', onIncoming);
      socket.on('session_ended', onEnded);
    } catch (_) {
      addSystem('Live updates are unavailable — your messages will still send.');
    }

    keepScrolledToLatest(log);
    timer = setInterval(paintTimer, 1000);
    paintTimer();

    // Auto-send the birth details, AFTER the socket is subscribed so the row
    // also renders on this screen rather than only reaching the astrologer.
    //
    // The condition is "have my details already been sent in this session?", NOT
    // "is the chat empty?" — the app learned that the hard way (ChatSessionScreen
    // carries the full note): the astrologer's own "Hello" lands inside the few
    // seconds this takes, the chat is then not empty, and the details were never
    // sent at all. Matching the marker also means a refresh mid-session, or a
    // session started in the app and continued here, will not send them twice.
    // A FAILED history read (null) errs toward sending: a duplicate is
    // recoverable, an astrologer reading a chart with no birth date is not.
    const alreadySent = Array.isArray(history)
      && history.some((m) => String(m?.message || '').includes(DETAILS_MARKER));
    if (!alreadySent && !ended) {
      try {
        await send(await buildDetailsMessage(me?.name));
      } catch (_) {
        // Never fatal: the customer can always type them out.
      }
    }
  })();

  // A closed tab needs nothing from us: the socket drops, and the backend's own
  // abandon check ends the session after its grace period. Deliberately NOT
  // ended on beforeunload — a refresh would then kill a live consultation, and
  // the resume path exists precisely so a refresh does not.
}
