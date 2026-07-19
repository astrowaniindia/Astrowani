import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import Sound from 'react-native-sound';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

Sound.setCategory('Playback');

const VoiceNotesScreen = () => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const soundRef = useRef(null);

  const fetchNotes = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.get('/api/customer/voice-notes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) setNotes(res.data.data || []);
    } catch (e) {
      console.warn('Voice notes fetch error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchNotes();
      return () => {
        soundRef.current?.stop();
        soundRef.current?.release();
      };
    }, [])
  );

  const markListened = async (note) => {
    if (note.listened_at) return;
    try {
      const token = await AsyncStorage.getItem('token');
      await Instance.post(`/api/customer/voice-notes/${note.id}/listened`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, listened_at: new Date().toISOString() } : n)));
    } catch (_) {}
  };

  const togglePlay = (note) => {
    if (playingId === note.id) {
      soundRef.current?.stop();
      soundRef.current?.release();
      soundRef.current = null;
      setPlayingId(null);
      return;
    }
    soundRef.current?.stop();
    soundRef.current?.release();

    const sound = new Sound(note.audio_url, undefined, (error) => {
      if (error) {
        console.warn('Voice note load error', error);
        return;
      }
      setPlayingId(note.id);
      markListened(note);
      sound.play(() => {
        setPlayingId(null);
        sound.release();
      });
    });
    soundRef.current = sound;
  };

  const renderItem = ({ item }) => {
    const isPlaying = playingId === item.id;
    return (
      <View style={[styles.card, !item.listened_at && styles.cardUnread]}>
        <Image
          source={item.astrologerImage ? { uri: item.astrologerImage } : require('../../assets/images/esoteric.png')}
          style={styles.avatar}
        />
        <View style={styles.cardBody}>
          <Text style={styles.astroName}>{item.astrologerName}</Text>
          <Text style={styles.metaText}>
            {item.duration_seconds ? `${item.duration_seconds}s · ` : ''}
            {new Date(item.created_at).toLocaleDateString('en-IN')}
          </Text>
        </View>
        <TouchableOpacity style={styles.playBtn} onPress={() => togglePlay(item)}>
          <Icon name={isPlaying ? 'pause' : 'play'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.containerCenter}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchNotes(true)} />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Icon name="mic-outline" size={40} color="#ccc" />
            <Text style={styles.emptyText}>No voice notes yet.</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  containerCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  list: { padding: scale(14) },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: scale(12),
    marginBottom: verticalScale(10),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: COLORS.AstroMaroon },
  avatar: { width: scale(46), height: scale(46), borderRadius: scale(23), backgroundColor: '#eee', marginRight: scale(12) },
  cardBody: { flex: 1 },
  astroName: { fontSize: moderateScale(14), fontWeight: 'bold', color: '#222' },
  metaText: { fontSize: moderateScale(12), color: '#888', marginTop: 2 },
  playBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: COLORS.AstroMaroon,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBox: { alignItems: 'center', paddingVertical: verticalScale(80) },
  emptyText: { fontSize: moderateScale(14), color: '#999', marginTop: verticalScale(12) },
});

export default VoiceNotesScreen;
