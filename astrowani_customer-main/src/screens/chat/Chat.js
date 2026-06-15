// Chat.js — Customer side (uses shared useChatRequest hook)
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { COLORS } from '../../Theme/Colors';
import { verticalScale } from '../../utils/Scaling';
import Allastrologers from './Allastrologers';
import Instance from '../../api/ApiCall';
import useChatRequest from '../../hooks/useChatRequest';
import RequestingPopup from '../../components/RequestingPopup';

const Chat = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [specialAstro, setSpecialAstro] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const { requesting, requestAstro, sendChatRequest, cancelRequest } = useChatRequest(navigation);

  const getAllAstrologers = async () => {
    try {
      setLoading(true);
      const response = await Instance.get(`/api/astrologers`);
      setSpecialAstro(response.data.data || []);
    } catch (err) {
      console.log('getAllAstrologers error:', err);
      setError('Failed to load astrologers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getAllAstrologers();
  }, []);

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
    return <Text style={styles.errorText}>Error: {error}</Text>;
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
