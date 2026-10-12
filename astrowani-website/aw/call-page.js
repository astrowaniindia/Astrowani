import { api } from './api.js?v=38';
import { getSocket, joinSessionWithRetry } from './socket.js?v=38';
import { toast, esc, confirmDialog } from './ui.js?v=38';
import { isSignedIn } from './session.js?v=38';
import { requireSignIn } from './auth.js?v=38';
import { fetchBalance, ensureFunds } from './wallet.js?v=38';
import { findAstrologer, onRosterChange, refresh as refreshRoster } from './astrologers.js?v=38';
import { requestConsultation, RequestClosed } from './request.js?v=38';
import { trackViewportHeight, keepAwake, ensureAudioPlays } from './mobile.js?v=38';

/**
 * call.html — the voice / video consultation screen.
 *
 * Talks to an astrologer running react-native-webrtc on a phone. It works
 * because the backend's signalling is a dumb relay: `webrtc_ready`,
 * `webrtc_offer`, `webrtc_answer` and `webrtc_ice_candidate` are forwarded
 * verbatim to the other member of the session room. Both ends are libwebrtc, so
 * a browser RTCPeerConnection and the app's are the same thing underneath; the
 * media is peer-to-peer and never touches our server (coturn relays only when a
 * direct path fails).
 *
 * THE ROLES ARE NOT SYMMETRIC AND MUST NOT BE SWAPPED. The customer is always
 * the offerer; the astrologer answers and announces readiness by emitting
 * `webrtc_ready` every 2s until connected. So this waits for that event before
 * creating the offer — exactly what the customer app does. Offering early
 * leaves the astrologer's app with an offer it is not yet listening for.
 */

const el = (id) => document.getElementById(id);

export async function initCallPage() {
  trackViewportHeight();

  const params = new URLSearchParams(location.search);
  const astrologerId = params.get('astrologer');
  const resumeSession = params.get('session');
  const video = params.get('type') === 'video';

  document.body.classList.toggle('is-video-call', video);

  if (!isSignedIn()) {
    setStage('Sign in to start your call', 'Your wallet works across the website and the app.');
    const ok = await requireSignIn({ reason: 'Sign in to call an astrologer.' });
    if (!ok) return setStage('Sign in to continue', 'You need to be signed in to call an astrologer.', { home: true });
  }

  if (resumeSession) {
    const info = await lookupActiveSession();
    if (!info || String(info.sessionId) !== String(resumeSession)) {
      return setStage('That call has ended', 'It is no longer active.', { home: true });
    }
    const astro = await resolveAstrologer(info.astrologerId, info);
    return runCall({
      sessionId: info.sessionId,
      astro,
      rate: Number(info.perMinuteCharge) || 0,
      video: info.callType === 'video',
    });
  }

  if (!astrologerId) return setStage('No astrologer selected', 'Pick an astrologer to start a call.', { home: true });

  setStage('Getting ready…', 'Checking the astrologer is free.');
  if (!findAstrologer(astrologerId)) await refreshRoster();
  const astro = findAstrologer(astrologerId);
  if (!astro) return setStage('Astrologer unavailable', 'We could not find that astrologer.', { home: true });

  paintPeer(astro);
  const rate = (video ? astro.video : astro.call) || 0;

  const funded = await ensureFunds({ rate, minutes: 5, label: video ? 'video call' : 'call' });
  if (!funded) {
    return setStage('Not enough balance', `You need at least ₹${rate * 5} to call ${astro.name}.`, { home: true });
  }

  let cancelRequest = null;
  setStage(`Connecting you to ${astro.name}`, 'Sending your call request…', {
    cancel: () => cancelRequest && cancelRequest('Call cancelled.'),
  });

  try {
    const { sessionId } = await requestConsultation({
      kind: 'call',
      astrologer: astro,
      callType: video ? 'video' : 'audio',
      onStatus: (text, { cancel }) => {
        cancelRequest = cancel;
        const t = el('aw-call-stage')?.querySelector('.aw-stage-text');
        if (t) t.textContent = text;
      },
    });
    runCall({ sessionId, astro, rate, video });
  } catch (err) {
    setStage('Call not started', err instanceof RequestClosed ? err.message : 'Please try again in a moment.', { home: true });
  }
}

function setStage(title, detail, { cancel, home } = {}) {
  const stage = el('aw-call-stage');
  const live = el('aw-call-live');
  if (live) live.hidden = true;
  stage.hidden = false;
  stage.innerHTML = `
    <div class="aw-stage-card">
      <div class="aw-stage-spinner" ${cancel ? '' : 'hidden'}></div>
      <h2 class="aw-stage-title">${esc(title)}</h2>
      <p class="aw-stage-text">${esc(detail || '')}</p>
      ${cancel ? '<button type="button" class="aw-btn aw-btn-ghost" data-act="cancel">Cancel</button>' : ''}
      ${home ? '<a class="aw-btn aw-btn-gold" href="astrologers.html">Back to astrologers</a>' : ''}
    </div>`;
  if (cancel) stage.querySelector('[data-act="cancel"]').addEventListener('click', cancel);
}

async function lookupActiveSession() {
  try {
    const res = await api.get('/api/customer/active-session');
    return res?.call || null;
  } catch (_) { return null; }
}

function resolveAstrologer(id, info) {
  const found = findAstrologer(id);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; off(); clearTimeout(t); resolve(v); } };
    const off = onRosterChange(() => { const f = findAstrologer(id); if (f) finish(f); });
    const t = setTimeout(() => finish({
      id, name: info?.astrologerName || 'Astrologer',
      photoUrl: info?.astrologerImage || '', photo: `${id}.jpg`,
    }), 2500);
    refreshRoster();
  });
}

function paintPeer(astro) {
  const img = el('aw-call-avatar');
  if (img) img.src = astro.photoUrl || `assets/astrologers/${astro.photo}`;
  const name = el('aw-call-name');
  if (name) name.textContent = astro.name;
}

function runCall({ sessionId, astro, rate, video }) {
  const stage = el('aw-call-stage');
  const live = el('aw-call-live');
  const statusEl = el('aw-call-status');
  const remoteVideo = el('aw-remote-video');
  const localVideo = el('aw-local-video');
  const remoteAudio = el('aw-remote-audio');
  const rateEl = el('aw-call-rate');

  paintPeer(astro);
  stage.hidden = true;
  live.hidden = false;
  if (rateEl) rateEl.textContent = `₹${rate}/min · billed per minute`;
  document.body.classList.toggle('is-video-call', video);

  // A phone that locks mid-call suspends the page and drops the socket, which
  // can tear down a call the customer is being billed for.
  const releaseWakeLock = keepAwake();
  ensureAudioPlays(remoteAudio);

  let socket = null, joinHandle = null, pc = null, localStream = null, remoteStream = null;
  let ended = false, connected = false, offerSent = false, iceBuffer = [], tick = null, connectedAt = null;

  const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };

  function paintTimer() {
    if (!connected || ended) return;
    const s = Math.floor((Date.now() - connectedAt) / 1000);
    setStatus(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
  }

  function markConnected() {
    if (connected || ended) return;
    connected = true;
    connectedAt = Date.now();
    live.classList.add('is-connected');
    clearInterval(tick);
    tick = setInterval(paintTimer, 1000);
    paintTimer();
  }

  async function buildPeer() {
    let cfg = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    try {
      // Served by the backend so a relay can be repaired or rotated without
      // touching this site (CLAUDE.md DM). Plain STUN is the fallback.
      const res = await api.get('/api/call/ice-servers', { auth: false, timeoutMs: 3500 });
      if (res?.iceServers?.length) cfg = { iceServers: res.iceServers };
    } catch (_) {}

    pc = new RTCPeerConnection(cfg);
    pc.onicecandidate = (e) => {
      if (e.candidate && socket) socket.emit('webrtc_ice_candidate', { sessionId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      if (!remoteStream) remoteStream = new MediaStream();
      remoteStream.addTrack(e.track);
      if (e.track.kind === 'video' && remoteVideo) {
        remoteVideo.srcObject = remoteStream;
        remoteVideo.play?.().catch(() => {});
      } else {
        remoteAudio.srcObject = remoteStream;
        remoteAudio.play?.().catch(() => {});
      }
      markConnected();
    };
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      console.log('[aw/call] ICE state:', s);
      if (s === 'connected' || s === 'completed') markConnected();
      if (s === 'failed') { try { pc.restartIce?.(); } catch (_) {} }
    };

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    if (video && localVideo) {
      localVideo.srcObject = localStream;
      localVideo.play?.().catch(() => {});
    }
  }

  async function onReady() {
    // The astrologer re-emits this every 2s until connected, so it must be
    // idempotent — a second offer would renegotiate a working call for nothing.
    if (offerSent || !pc || ended) return;
    offerSent = true;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc_offer', { sessionId, offer: pc.localDescription });
      setStatus('Ringing…');
    } catch (e) {
      console.error('[aw/call] createOffer failed:', e);
      offerSent = false;
    }
  }

  async function onAnswer(d) {
    if (!pc || !d?.answer || ended) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
      for (const c of iceBuffer) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {} }
      iceBuffer = [];
    } catch (e) { console.error('[aw/call] setRemoteDescription failed:', e); }
  }

  async function onCandidate(d) {
    if (!pc || !d?.candidate || ended) return;
    if (pc.remoteDescription?.type) { try { await pc.addIceCandidate(new RTCIceCandidate(d.candidate)); } catch (_) {} }
    else iceBuffer.push(d.candidate);
  }

  function onEnded(d) {
    if (d?.sessionId && String(d.sessionId) !== String(sessionId)) return;
    if (ended) return;
    finish(d?.reason === 'insufficient_balance' ? 'Your balance ran out, so the call ended.' : 'The call has ended.');
  }

  async function finish(message) {
    if (ended) return;
    ended = true;
    // ALWAYS settle through the API, even when the other side hung up first —
    // this is what finalises billing.
    try { await api.post('/api/call/end', { sessionId }); } catch (_) {}
    teardown();
    fetchBalance({ force: true });
    sessionStorage.setItem('aw_flash', message || 'Call ended.');
    window.location.href = 'astrologers.html';
  }

  function teardown() {
    ended = true;
    clearInterval(tick);
    releaseWakeLock();
    joinHandle?.stop();
    if (socket) {
      socket.off('webrtc_ready', onReady);
      socket.off('webrtc_answer', onAnswer);
      socket.off('webrtc_ice_candidate', onCandidate);
      socket.off('session_ended', onEnded);
    }
    try { localStream?.getTracks().forEach((t) => t.stop()); } catch (_) {}
    try { pc?.close(); } catch (_) {}
    pc = null;
  }

  // ---- controls ----
  let muted = false;
  el('aw-ctl-mute').addEventListener('click', (e) => {
    muted = !muted;
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    e.currentTarget.classList.toggle('is-on', muted);
    e.currentTarget.querySelector('span').textContent = muted ? 'Unmute' : 'Mute';
  });

  const camBtn = el('aw-ctl-cam');
  if (camBtn) {
    camBtn.hidden = !video;
    let camOff = false;
    camBtn.addEventListener('click', (e) => {
      camOff = !camOff;
      localStream?.getVideoTracks().forEach((t) => { t.enabled = !camOff; });
      e.currentTarget.classList.toggle('is-on', camOff);
      e.currentTarget.querySelector('span').textContent = camOff ? 'Camera on' : 'Camera off';
    });
  }

  el('aw-ctl-end').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'End this call?',
      message: 'Billing stops as soon as the call ends.',
      confirmLabel: 'End call',
      cancelLabel: 'Stay on call',
    });
    if (ok === true) finish('Call ended.');
  });

  (async () => {
    try {
      await buildPeer();
    } catch (err) {
      console.error('[aw/call] media failed:', err);
      await finish(err?.name === 'NotAllowedError'
        ? 'Microphone access is needed for a call. Please allow it and try again.'
        : 'Could not start your microphone or camera.');
      return;
    }

    try {
      socket = await getSocket();
      joinHandle = joinSessionWithRetry(socket, sessionId, { label: 'Web/Call' });
      socket.on('webrtc_ready', onReady);
      socket.on('webrtc_answer', onAnswer);
      socket.on('webrtc_ice_candidate', onCandidate);
      socket.on('session_ended', onEnded);
    } catch (_) {
      await finish('Could not connect the call. Please try again.');
      return;
    }

    setStatus('Connecting…');

    // Safety net: never leave the customer on a dead screen waiting. 60s is well
    // past a normal setup.
    setTimeout(() => {
      if (!connected && !ended) {
        finish('We could not connect this call. You have not been charged for talk time.');
      }
    }, 60000);
  })();
}
