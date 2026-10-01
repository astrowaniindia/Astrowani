import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

// In-chat connection notice (2026-10-02). Deliberately NOT a popup: the owner's call was that
// both people are already looking at the chat, so a modal would interrupt the reading for
// every two-second network hiccup. It sits above the input, always visible, and says four
// things — whose connection is the problem, that we are waiting, that billing is paused, and
// that messages will not be delivered meanwhile.
//
// THE LAST LINE IS NOT DECORATION. The server now refuses to carry a disconnected
// participant's messages (SERVICE_PRESENCE_GRACE_MS in index.js, 20s). Without this notice a
// send would simply fail and look like the app was broken.
//
// WHY BOTH A LOCAL AND A REMOTE SIGNAL. The server cannot tell the person who dropped — they
// are not in the room, which is the whole problem — so their own socket's 'disconnect' is the
// only thing that knows. The person still online is told by the server via 'participant_absent',
// which carries WHO dropped. Between them nobody is ever asked to fix a connection that is not
// theirs.

// Mirrors the server's grace so the countdown matches what actually happens:
// index.js SESSION_ABANDON_GRACE_MS and sessionManager's SESSION_PRESENCE_GRACE_MS /
// VENDOR_ABSENT_GRACE_MS are all 30s as of 2026-10-02. Display only — the server decides.
// A 'participant_absent' event carries the real grace and overrides this.
export const CONNECTION_GRACE_MS = 30 * 1000;
const RECONNECTED_VISIBLE_MS = 4000;

export function useSessionConnection(socketRef, sessionId) {
  const [absence, setAbsence] = useState(null); // { mine, startedAt, graceMs }
  const [reconnectedAt, setReconnectedAt] = useState(0);
  // Milliseconds of COMPLETED pauses. The pause currently running is not in here — see
  // billableSeconds(), which freezes on absence.startedAt instead, so the number on screen
  // cannot drift while it is stopped.
  const [completedExcludedMs, setCompletedExcludedMs] = useState(0);
  const [, tick] = useState(0);
  const absenceRef = useRef(null);
  absenceRef.current = absence;
  const excludedRef = useRef(0);

  // Close the running pause and bank it.
  const endPause = () => {
    const a = absenceRef.current;
    if (!a || !a.startedAt) return;
    excludedRef.current += Math.max(0, Date.now() - a.startedAt);
    setCompletedExcludedMs(excludedRef.current);
  };

  useEffect(() => {
    let detach = null;
    let poll = null;

    const attach = (sock) => {
      const onDisconnect = () => {
        if (absenceRef.current) return; // already paused — do not restart the clock
        setAbsence({ mine: true, startedAt: Date.now(), graceMs: CONNECTION_GRACE_MS });
      };
      const onConnect = () => {
        const a = absenceRef.current;
        if (!a || !a.mine) return;
        endPause();
        setReconnectedAt(Date.now());
        setAbsence(null);
      };
      const sameSession = (d) => !sessionId || !d || !d.sessionId || String(d.sessionId) === String(sessionId);
      const onAbsent = (d) => {
        if (!sameSession(d)) return;
        // The server sends this TWICE for one drop — immediately from its disconnect
        // handler, then again from the 30s billing poll. Taking the second one would
        // restart the countdown and throw away the pause already accrued, so the timer
        // would jump and the grace would silently double.
        if (absenceRef.current) return;
        setAbsence({ mine: false, startedAt: Date.now(), graceMs: (d && d.graceMs) || CONNECTION_GRACE_MS });
      };
      const onBack = (d) => {
        if (!sameSession(d)) return;
        const a = absenceRef.current;
        if (!a || a.mine) return;
        endPause();
        setReconnectedAt(Date.now());
        setAbsence(null);
      };
      sock.on('disconnect', onDisconnect);
      sock.on('connect', onConnect);
      sock.on('participant_absent', onAbsent);
      sock.on('participant_back', onBack);
      detach = () => {
        try {
          sock.off('disconnect', onDisconnect);
          sock.off('connect', onConnect);
          sock.off('participant_absent', onAbsent);
          sock.off('participant_back', onBack);
        } catch (_) {}
      };
    };

    // The screen creates its socket inside an async init, so it may not exist yet.
    if (socketRef.current) attach(socketRef.current);
    else poll = setInterval(() => {
      if (socketRef.current) { clearInterval(poll); poll = null; attach(socketRef.current); }
    }, 400);

    return () => { if (poll) clearInterval(poll); if (detach) detach(); };
  }, [socketRef, sessionId]);

  // Re-render once a second so the countdown moves and the "reconnected" line clears itself.
  useEffect(() => {
    if (!absence && !reconnectedAt) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [absence, reconnectedAt]);

  const now = Date.now();
  const secsLeft = absence
    ? Math.max(0, Math.ceil(((absence.startedAt + absence.graceMs) - now) / 1000))
    : 0;

  return {
    absence,
    secsLeft,
    completedExcludedMs,
    // Send is blocked while absent: the server would refuse it anyway, and a silent
    // failure is exactly what made the 2026-10-01 outage invisible.
    blocked: !!absence,
    showReconnected: !absence && !!reconnectedAt && (now - reconnectedAt) < RECONNECTED_VISIBLE_MS,
  };
}

// mode: 'chat' sits in the message list above the input; 'call' floats over the call UI,
// where there are no messages to withhold — the media is peer-to-peer and the server cannot
// stop it, so the honest line there is simply that the call will end.
/**
 * Seconds to SHOW on a timer the person reads as money, with disconnected time taken out.
 *
 * WHY THIS EXISTS (owner, 2026-10-02, after watching it on a device): billing pauses while
 * someone is disconnected, but the header clock kept counting. A chat that read 01:33 had
 * only ~01:03 of billable time behind it, so the customer's "I was charged for less than
 * the timer showed" and the astrologer's "I wasn't credited for all of it" are the SAME
 * gap, argued from opposite ends. Freezing the clock while the wallet is frozen removes
 * the argument.
 *
 * Computed from timestamps, never by subtracting one ticking counter from another: while
 * paused it measures up to absence.startedAt, a fixed point, so the display is exactly
 * still rather than flickering between two values as two intervals race.
 *
 * DISPLAY ONLY. The raw useElapsedSeconds value is deliberately left alone — it feeds the
 * free-call cutoff, duration_seconds and call history, and quietly redefining those is how
 * a timer tweak turns into a money bug.
 */
export function billableSeconds(startMs, conn) {
  if (!startMs) return 0;
  const completed = (conn && conn.completedExcludedMs) || 0;
  const upTo = conn && conn.absence ? conn.absence.startedAt : Date.now();
  return Math.max(0, Math.floor((upTo - startMs - completed) / 1000));
}

export default function SessionConnectionNotice({ conn, t, mode = 'chat', style }) {
  if (!conn) return null;
  if (conn.showReconnected) {
    return (
      <View style={[styles.box, styles.okBox, style]}>
        <Text style={styles.okText}>{t('call.connReconnected')}</Text>
      </View>
    );
  }
  if (!conn.absence) return null;
  return (
    <View style={[styles.box, style]}>
      <Text style={styles.title}>
        {conn.absence.mine ? t('call.connYouOffline') : t('call.connOtherOffline')}
      </Text>
      {/* The wallet line goes FIRST and in bold: it is the only line that is about money,
          and it is the thing neither side knew during the 2026-10-01 incident. */}
      <Text style={styles.money}>{t('call.connBillingPaused')}</Text>
      <Text style={styles.line}>
        {mode === 'call'
          ? t('call.connCallEnding', { secs: conn.secsLeft })
          : t('call.connWaiting', { secs: conn.secsLeft })}
      </Text>
      {mode !== 'call' && (
        <Text style={styles.line}>{t('call.connNoDelivery')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(120, 53, 15, 0.96)',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 10,
    marginBottom: 6,
    borderRadius: 8,
  },
  okBox: { backgroundColor: 'rgba(6, 95, 70, 0.96)', borderLeftColor: '#34d399' },
  title: { color: '#fde68a', fontSize: 13, fontWeight: '700', marginBottom: 3 },
  line: { color: '#fef3c7', fontSize: 12, lineHeight: 17 },
  money: { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  okText: { color: '#d1fae5', fontSize: 13, fontWeight: '600' },
});
