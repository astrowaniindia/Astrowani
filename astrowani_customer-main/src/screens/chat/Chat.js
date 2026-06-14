// Chat.js — Customer side
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import Allastrologers from './Allastrologers';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../api/SupabaseClient';

const Chat = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [specialAstro, setSpecialAstro] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Request-flow state
  const [requesting, setRequesting] = useState(false);  // "Requesting…" popup
  const [requestAstro, setRequestAstro] = useState(null); // astrologer we requested
  const [pendingRequestId, setPendingRequestId] = useState(null);

  const channelRef = useRef(null);
  const mountedRef = useRef(true);

  // ─── Load astrologers ────────────────────────────────────────────────────────
  const getAllAstrologers = async () => {
    try {
      setLoading(true);
      const response = await Instance.get(`/api/astrologers`);
      if (!mountedRef.current) return;
      setSpecialAstro(response.data.data || []);
    } catch (err) {
      console.log('getAllAstrologers error:', err);
      if (!mountedRef.current) return;
      setError('Failed to load astrologers');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  // ─── Supabase listener for request status updates ────────────────────────────
  const listenForRequestUpdate = async (requestId) => {
    const userStr = await AsyncStorage.getItem('userData');
    const user = userStr ? JSON.parse(userStr) : null;
    if (!user) return;

    // Clean up previous channel
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    channelRef.current = supabase.channel(`req_status_${requestId}`);
    channelRef.current
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_requests',
          filter: `id=eq.${requestId}`,
        },
        async (payload) => {
          if (!mountedRef.current) return;
          const updated = payload.new;

          if (updated.status === 'accepted') {
            setRequesting(false);
            setPendingRequestId(null);
            // Navigate to ChatSessionScreen with requestId
            navigation.navigate('ChatSessionScreen', {
              requestId: requestId,
              person: requestAstro,
            });
          } else if (updated.status === 'rejected') {
            setRequesting(false);
            setPendingRequestId(null);
            Alert.alert('Astrologer Busy', 'The astrologer is currently busy. Please try again later.');
          }
        }
      )
      .subscribe();
  };

  useEffect(() => {
    mountedRef.current = true;
    getAllAstrologers();
    return () => {
      mountedRef.current = false;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  // ─── Handle Chat button press ─────────────────────────────────────────────
  const handleChat = async (item) => {
    try {
      const userStr = await AsyncStorage.getItem('userData');
      const user = userStr ? JSON.parse(userStr) : null;
      if (!user) {
        Alert.alert('Error', 'Please log in first.');
        return;
      }

      // Check wallet balance before requesting
      const token = await AsyncStorage.getItem('token');
      const walletResp = await fetch(
        `${Instance.defaults.baseURL}/api/wallet`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const walletJson = await walletResp.json();
      const balance = walletJson?.data?.balance ?? 0;

      const chargePerMin = item.chat_charge_per_minute ?? item.chatChargePerMinute ?? 0;
      if (balance < chargePerMin) {
        Alert.alert('Low Balance', 'Your wallet balance is too low to start a chat. Please recharge.');
        return;
      }

      // Create request in Supabase
      const { data, error } = await supabase.from('chat_requests').insert([
        {
          caller_id: user._id,
          receiver_id: item._id || item.id,
          status: 'pending',
          request_type: 'chat',
        },
      ]).select();

      if (error) throw error;
      const requestId = data[0]?.id;

      setRequestAstro(item);
      setPendingRequestId(requestId);
      setRequesting(true);

      // Start listening for vendor response
      await listenForRequestUpdate(requestId);
    } catch (err) {
      console.log('handleChat error:', err);
      Alert.alert('Error', 'Could not send chat request. Please try again.');
    }
  };

  // ─── Cancel pending request ───────────────────────────────────────────────
  const cancelRequest = async () => {
    if (pendingRequestId) {
      await supabase
        .from('chat_requests')
        .update({ status: 'cancelled' })
        .eq('id', pendingRequestId);
    }
    setRequesting(false);
    setPendingRequestId(null);
    setRequestAstro(null);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await getAllAstrologers();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.indicator}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return <Text style={styles.errorText}>Error: {error}</Text>;
  }

  return (
    <View style={styles.main}>
      <Allastrologers
        actionButton={handleChat}
        data={specialAstro}
        handleAstrologer={(item) => navigation.navigate('AstrologerInfo', { person: item })}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

      {/* ── "Requesting…" popup ─────────────────────────────── */}
      <Modal visible={requesting} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.popup}>
            <ActivityIndicator size="large" color={COLORS.AstroMaroon} style={{ marginBottom: 16 }} />
            <Text style={styles.popupTitle}>Requesting Chat…</Text>
            <Text style={styles.popupSubtitle}>
              Waiting for {requestAstro?.name || 'the astrologer'} to accept
            </Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelRequest}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  main: { flex: 1, backgroundColor: COLORS.white },
  indicator: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: 'red', textAlign: 'center', paddingVertical: verticalScale(10) },

  // Requesting popup
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popup: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 28,
    width: '80%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    elevation: 15,
  },
  popupTitle: {
    color: '#fff',
    fontSize: moderateScale(20),
    fontWeight: '700',
    marginBottom: 8,
  },
  popupSubtitle: {
    color: '#aaa',
    fontSize: moderateScale(14),
    textAlign: 'center',
    marginBottom: 24,
  },
  cancelBtn: {
    backgroundColor: '#F44336',
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 30,
  },
  cancelText: { color: '#fff', fontWeight: 'bold', fontSize: moderateScale(15) },
});

export default Chat;
