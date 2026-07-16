// Chat.js — Customer side (uses shared useChatRequest hook)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../Theme/Colors';
import { verticalScale } from '../../utils/Scaling';
import Allastrologers from './Allastrologers';
import Instance from '../../api/ApiCall';
import { supabase } from '../../api/SupabaseClient';
import useChatRequest from '../../hooks/useChatRequest';
import RequestingPopup from '../../components/RequestingPopup';
import { LanguageContext } from '../../context/LanguageContext';

const Chat = ({ navigation }) => {
  const { t } = React.useContext(LanguageContext);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [specialAstro, setSpecialAstro] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const { requesting, requestAstro, sendChatRequest, cancelRequest } = useChatRequest(navigation);

  const getAllAstrologers = useCallback(async () => {
    try {
      setLoading(true);
      // Show ALL astrologers — the Chat button reflects is_chat_enabled per card
      // (red "Unavailable" when off) rather than hiding the astrologer.
      const response = await Instance.get(`/api/astrologers`);
      setSpecialAstro(response.data.data || []);
      setError(null); // clear any stale error from a prior failed attempt
    } catch (err) {
      console.log('getAllAstrologers error:', err);
      setError('Failed to load astrologers');
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch whenever the screen regains focus (catches vendor toggle changes)
  useFocusEffect(
    useCallback(() => {
      getAllAstrologers();
    }, [getAllAstrologers]),
  );

  // Live sync — re-fetch when any astrologer row changes (toggles, charges, availability)
  useEffect(() => {
    // Unique name per run — a fixed name makes supabase.channel() return an already-
    // subscribed channel and .on()-after-subscribe() throws.
    const channel = supabase
      .channel(`chat-astro-list-${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'astrologers' },
        () => getAllAstrologers(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [getAllAstrologers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await getAllAstrologers();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  if (error) {
    return <Text style={styles.errorText}>{t('common.error')}: {error}</Text>;
  }

  return (
    <View style={styles.main}>
      <Allastrologers
        actionButton={sendChatRequest}
        data={specialAstro}
        handleAstrologer={(item) => navigation.navigate('AstrologerInfo', { person: item })}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

      <RequestingPopup
        visible={requesting}
        astro={requestAstro}
        onCancel={cancelRequest}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  main: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: 'red', textAlign: 'center', paddingVertical: verticalScale(10) },
});

export default Chat;
