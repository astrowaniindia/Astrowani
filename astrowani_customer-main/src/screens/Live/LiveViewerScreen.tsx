import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  Alert,
  Platform,
  PermissionsAndroid,
  KeyboardAvoidingView,
  StatusBar,
} from 'react-native';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  RTCView,
  mediaDevices,
} from 'react-native-webrtc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import {SOCKET_URL} from '../../config/api';
import {COLORS} from '../../Theme/Colors';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import GiftModal from '../../Component/Modal';

const ICE_SERVERS = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
  ],
};

// Customer live viewer — one peer connection to the broadcaster (mesh node).
const LiveViewerScreen = ({route, navigation}: any) => {
  const {sessionId, astrologer} = route.params || {};
  const astrologerId = astrologer?.userId || astrologer?._id;

  const [remoteStreamURL, setRemoteStreamURL] = useState<string | null>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [comment, setComment] = useState('');
  const [giftVisible, setGiftVisible] = useState(false);
  const [connecting, setConnecting] = useState(true);

  const viewerIdRef = useRef<string>('');
  const viewerNameRef = useRef<string>('Guest');
  const socketRef = useRef<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const leftRef = useRef(false);

  const pushFeed = (item: any) =>
    setFeed(prev => [...prev.slice(-40), {...item, key: `${Date.now()}_${Math.random()}`}]);

  const cleanup = useCallback((emitLeave: boolean) => {
    if (emitLeave && !leftRef.current) {
      socketRef.current?.emit('live_leave', {sessionId, astrologerId, viewerId: viewerIdRef.current});
    }
    leftRef.current = true;
    if (pcRef.current) { try { pcRef.current.close(); } catch (_) {} pcRef.current = null; }
    if (socketRef.current) { socketRef.current.removeAllListeners(); socketRef.current.disconnect(); socketRef.current = null; }
  }, [sessionId, astrologerId]);

  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      // Viewers don't publish media, but Android needs mic permission for WebRTC to init reliably.
      if (Platform.OS === 'android') {
        try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO); } catch (_) {}
      }

      const userStr = await AsyncStorage.getItem('userData');
      const user = userStr ? JSON.parse(userStr) : null;
      viewerIdRef.current = user?.id || user?._id || `guest_${Date.now()}`;
      viewerNameRef.current = user?.name || user?.firstName || 'Guest';
      if (cancelled) return;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      (pc as any).ontrack = (e: any) => {
        if (e.streams && e.streams[0]) { setRemoteStreamURL((e.streams[0] as any).toURL()); setConnecting(false); }
      };
      (pc as any).onicecandidate = (e: any) => {
        if (e.candidate) {
          socketRef.current?.emit('live_ice', {
            to: astrologerId, viewerId: viewerIdRef.current, candidate: e.candidate, role: 'viewer', sessionId,
          });
        }
      };

      const socket = io(SOCKET_URL);
      socketRef.current = socket;
      socket.on('connect', () => {
        socket.emit('join_room', viewerIdRef.current);
        socket.emit('live_join', {
          sessionId, astrologerId, viewerId: viewerIdRef.current, viewerName: viewerNameRef.current,
        });
      });

      socket.on('live_offer', async (d: any) => {
        if (d.viewerId !== viewerIdRef.current || !d.offer) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('live_answer', {astrologerId, viewerId: viewerIdRef.current, sessionId, answer});
        } catch (err) { console.log('[LiveViewer] answer error', err); }
      });
      socket.on('live_ice', async (d: any) => {
        if (d?.role === 'broadcaster' && d.viewerId === viewerIdRef.current && d.candidate) {
          try { await pc.addIceCandidate(new RTCIceCandidate(d.candidate)); } catch (_) {}
        }
      });
      socket.on('live_comment', (d: any) => pushFeed({type: 'comment', name: d.name, message: d.message}));
      socket.on('live_gift', (d: any) => pushFeed({type: 'gift', name: d.name, giftName: d.giftName, amount: d.amount}));
      socket.on('live_ended', () => {
        if (leftRef.current) return;
        Alert.alert('Live ended', `${astrologer?.name || 'The astrologer'} has ended the live.`);
        cleanup(false);
        navigation.goBack();
      });
    };

    setup();
    return () => { cancelled = true; cleanup(true); };
  }, [sessionId, astrologerId, astrologer, cleanup, navigation]);

  const sendComment = () => {
    const msg = comment.trim();
    if (!msg) return;
    // No optimistic add — the backend echoes live_comment to everyone in the room
    // (including us, since we joined live_<sessionId>), so adding here would duplicate it.
    socketRef.current?.emit('live_comment', {sessionId, name: viewerNameRef.current, message: msg});
    setComment('');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {remoteStreamURL ? (
        <RTCView streamURL={remoteStreamURL} style={StyleSheet.absoluteFillObject} objectFit="cover" zOrder={0} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.placeholder]}>
          {astrologer?.profileImage ? (
            <Image source={{uri: astrologer.profileImage}} style={styles.placeholderAvatar} />
          ) : null}
          <Text style={styles.placeholderText}>{connecting ? 'Connecting to live…' : 'Waiting for video…'}</Text>
        </View>
      )}
      <View style={styles.scrim} pointerEvents="none" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Image source={{uri: astrologer?.profileImage || 'https://cdn-icons-png.flaticon.com/128/3135/3135715.png'}} style={styles.avatar} />
        <View style={{marginLeft: 8, flex: 1}}>
          <Text style={styles.name} numberOfLines={1}>{astrologer?.name || 'Astrologer'}</Text>
          <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => { cleanup(true); navigation.goBack(); }}>
          <MaterialIcons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Feed */}
      <FlatList
        style={styles.feed}
        data={feed}
        keyExtractor={i => i.key}
        renderItem={({item}) =>
          item.type === 'gift' ? (
            <View style={styles.giftRow}>
              <MaterialIcons name="card-giftcard" size={16} color={COLORS.AstroGold} />
              <Text style={styles.giftText}>{item.name || 'Someone'} sent {item.giftName} (₹{item.amount})</Text>
            </View>
          ) : (
            <View style={styles.commentRow}>
              <Text style={styles.commentName}>{item.name || 'Guest'}: </Text>
              <Text style={styles.commentText}>{item.message}</Text>
            </View>
          )
        }
      />

      {/* Bottom bar: comment input + gift */}
      <KeyboardAvoidingView
        style={styles.bottomWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.bottomBar}>
          <TextInput
            style={styles.input}
            placeholder="Say something…"
            placeholderTextColor="#ddd"
            value={comment}
            onChangeText={setComment}
            onSubmitEditing={sendComment}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendComment}>
            <MaterialIcons name="send" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.giftBtn} onPress={() => setGiftVisible(true)}>
            <MaterialIcons name="card-giftcard" size={24} color={COLORS.AstroMaroon} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <GiftModal
        visible={giftVisible}
        onClose={() => setGiftVisible(false)}
        astrologer={astrologer}
        context="live"
        sessionId={sessionId}
      />
    </View>
  );
};

export default LiveViewerScreen;

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  scrim: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)'},
  placeholder: {backgroundColor: COLORS.AstroMaroon, justifyContent: 'center', alignItems: 'center'},
  placeholderAvatar: {width: 90, height: 90, borderRadius: 45, marginBottom: 16, borderWidth: 2, borderColor: COLORS.AstroGold},
  placeholderText: {color: '#fff', fontSize: 16},
  topBar: {position: 'absolute', top: 40, left: 12, right: 12, flexDirection: 'row', alignItems: 'center'},
  avatar: {width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.AstroGold},
  name: {color: '#fff', fontWeight: 'bold', fontSize: 15},
  liveBadge: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#C0392B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginTop: 2},
  liveDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', marginRight: 4},
  liveText: {color: '#fff', fontSize: 10, fontWeight: 'bold', letterSpacing: 1},
  closeBtn: {width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center'},
  feed: {position: 'absolute', left: 12, right: 12, bottom: 80, maxHeight: 260},
  commentRow: {flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginTop: 6, alignSelf: 'flex-start', maxWidth: '90%'},
  commentName: {color: COLORS.AstroGold, fontWeight: 'bold', fontSize: 13},
  commentText: {color: '#fff', fontSize: 13, flexShrink: 1},
  giftRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(107,31,42,0.85)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6, alignSelf: 'flex-start'},
  giftText: {color: '#fff', fontSize: 13, marginLeft: 6, fontWeight: '600'},
  bottomWrap: {position: 'absolute', left: 0, right: 0, bottom: 0},
  bottomBar: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 24, backgroundColor: 'rgba(0,0,0,0.3)'},
  input: {flex: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 22, paddingHorizontal: 16, color: '#fff'},
  sendBtn: {width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.AstroMaroon, justifyContent: 'center', alignItems: 'center', marginLeft: 8},
  giftBtn: {width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.AstroGold, justifyContent: 'center', alignItems: 'center', marginLeft: 8},
});
