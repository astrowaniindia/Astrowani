// ChatSessionScreen.js — Customer side
// Shows timer + wallet balance on top, live chat below
// Deducts per-minute charge from customer, credits vendor
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/SupabaseClient';
import PersonToPersonChat from './component/PersonToPersonChat';
import { COLORS } from '../Theme/Colors';
import Instance from '../api/ApiCall';
import Ionicons from 'react-native-vector-icons/Ionicons';

const ChatSessionScreen = ({ route, navigation }) => {
  const { requestId, person } = route.params;

  const [session, setSession] = useState(null);      // chat_sessions row
  const [seconds, setSeconds] = useState(0);
  const [wallet, setWallet] = useState(0);
  const [ended, setEnded] = useState(false);

  const secondTimerRef = useRef(null);
  const minuteTimerRef = useRef(null);
  const sessionRef = useRef(null);
  const walletRef = useRef(0);

  // ─── Load wallet balance ──────────────────────────────────────────────────
  const loadWallet = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const resp = await fetch(
        `${Instance.defaults.baseURL}/api/wallet`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await resp.json();
      const bal = json?.data?.balance ?? 0;
      setWallet(bal);
      walletRef.current = bal;
    } catch (e) {
      console.warn('loadWallet error:', e);
    }
  };

  // ─── Load/poll chat session until it exists ───────────────────────────────
  const loadSession = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('request_id', requestId)
        .single();
      if (data) {
        setSession(data);
        sessionRef.current = data;
        return true;
      }
    } catch (e) {}
    return false;
  };

  // ─── Deduct from customer wallet, credit vendor ───────────────────────────
  const deductAndCredit = async () => {
    const sess = sessionRef.current;
    if (!sess) return;
    const charge = sess.per_minute_charge ?? 0;

    if (walletRef.current <= 0 || walletRef.current < charge) {
      endSession('Balance empty – ending chat.');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${Instance.defaults.baseURL}/api/wallet/deduct-and-credit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: sess.id,
          requestId: requestId,
          amount: charge,
        }),
      });

      const newBal = walletRef.current - charge;
      walletRef.current = newBal;
      setWallet(newBal);
    } catch (e) {
      console.warn('deductAndCredit error:', e);
    }
  };

  // ─── End session ──────────────────────────────────────────────────────────
  const endSession = (message) => {
    if (ended) return;
    setEnded(true);
    clearInterval(secondTimerRef.current);
    clearInterval(minuteTimerRef.current);

    // Mark session ended in DB
    if (sessionRef.current) {
      supabase
        .from('chat_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', sessionRef.current.id)
        .then(() => {});
    }

    if (message) {
      Alert.alert('Session Ended', message, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  };

  // ─── Initialise everything ────────────────────────────────────────────────
  useEffect(() => {
    let pollCount = 0;
    const init = async () => {
      await loadWallet();

      // Poll for session (vendor might take a moment to create it)
      const poll = setInterval(async () => {
        pollCount++;
        const found = await loadSession();
        if (found) {
          clearInterval(poll);
          startTimers();
        }
        if (pollCount > 15) {
          clearInterval(poll);
          Alert.alert('Error', 'Session could not be started.');
          navigation.goBack();
        }
      }, 1000);
    };

    init();
    return () => {
      clearInterval(secondTimerRef.current);
      clearInterval(minuteTimerRef.current);
    };
  }, []);

  const startTimers = () => {
    // Second-by-second timer for display
    secondTimerRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    // Per-minute billing
    minuteTimerRef.current = setInterval(() => {
      deductAndCredit();
    }, 60 * 1000);
  };

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const pad = (n) => n.toString().padStart(2, '0');

  return (
    <View style={styles.container}>
      {/* ── Top bar: timer + wallet ─────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => endSession(null)} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.astroName}>{person?.name || 'Astrologer'}</Text>
          {session ? (
            <Text style={styles.charge}>₹{session.per_minute_charge}/min</Text>
          ) : (
            <Text style={styles.charge}>Connecting…</Text>
          )}
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.timer}>{pad(minutes)}:{pad(secs)}</Text>
          <Text style={styles.walletBal}>₹{wallet}</Text>
        </View>
      </View>

      {/* ── Chat area ──────────────────────────────────────── */}
      {session ? (
        <PersonToPersonChat
          person={person}
          navigation={navigation}
          sessionId={session.id}
        />
      ) : (
        <View style={styles.waiting}>
          <Text style={styles.waitingText}>Connecting to chat…</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
  },
  backBtn: { marginRight: 10 },
  headerCenter: { flex: 1 },
  astroName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  charge: { color: '#ffd', fontSize: 12 },
  headerRight: { alignItems: 'flex-end' },
  timer: { color: '#fff', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  walletBal: { color: '#ffd', fontSize: 12 },
  waiting: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  waitingText: { color: '#888', fontSize: 16 },
});

export default ChatSessionScreen;
