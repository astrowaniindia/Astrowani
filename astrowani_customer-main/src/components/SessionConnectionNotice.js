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
  const [, tick] = useState(0);
  const absenceRef = useRef(null);
  absenceRef.current = absence;

  useEffect(() => {
    let detach = null;
    let poll = null;

    const attach = (sock) => {
      const onDisconnect = () => setAbsence((a) => a || { mine: true, startedAt: Date.now(), graceMs: CONNECTION_GRACE_MS });
      const onConnect = () => setAbsence((a) => {
        if (a && a.mine) { setReconnectedAt(Date.now()); return null; }
        return a;
      });
      const sameSession = (d) => !sessionId || !d || !d.sessionId || String(d.sessionId) === String(sessionId);
      const onAbsent = (d) => {
        if (!sameSession(d)) return;
        setAbsence({ mine: false, startedAt: Date.now(), graceMs: (d && d.graceMs) || CONNECTION_GRACE_MS });
      };
      const onBack = (d) => {
        if (!sameSession(d)) return;
        setAbsence((a) => {
          if (a && !a.mine) { setReconnectedAt(Date.now()); return null; }
          return a;
        });
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
    // Send is blocked while absent: the server would refuse it anyway, and a silent
    // failure is exactly what made the 2026-10-01 outage invisible.
    blocked: !!absence,
    showReconnected: !absence && !!reconnectedAt && (now - reconnectedAt) < RECONNECTED_VISIBLE_MS,
  };
}

export default function SessionConnectionNotice({ conn, t }) {
  if (!conn) return null;
  if (conn.showReconnected) {
    return (
      <View style={[styles.box, styles.okBox]}>
        <Text style={styles.okText}>{t('chatSession.connReconnected')}</Text>
      </View>
    );
  }
  if (!conn.absence) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>
        {conn.absence.mine ? t('chatSession.connYouOffline') : t('chatSession.connOtherOffline')}
      </Text>
      <Text style={styles.line}>{t('chatSession.connWaiting', { secs: conn.secsLeft })}</Text>
      <Text style={styles.line}>{t('chatSession.connBillingPaused')}</Text>
      <Text style={styles.line}>{t('chatSession.connNoDelivery')}</Text>
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
  okText: { color: '#d1fae5', fontSize: 13, fontWeight: '600' },
});
