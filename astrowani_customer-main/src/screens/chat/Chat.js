// Chat.js
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/ApiCall';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import Allastrologers from './Allastrologers';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';

const SOCKET_URL = api;

const Chat = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState('');
  const [astrologer, setAstrologer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [specialAstro, setSpecialAstro] = useState([]);
  const [messages, setMessages] = useState([]); // store incoming messages
  const socketRef = useRef(null);
  const mountedRef = useRef(true);
  const currentChatRef = useRef(null); // track current opened astrologer id

  // Fetch all astrologers
  const getAllAstrologers = async () => {
    try {
      setLoading(true);
      const response = await Instance.get(`/api/astrologers`);
      if (!mountedRef.current) return;
      setSpecialAstro(response.data.data || []);
      setLoading(false);
    } catch (err) {
      console.log('getAllAstrologers error: ', err);
      if (!mountedRef.current) return;
      setError('Failed to load astrologers');
      setLoading(false);
    }
  };

  // Initialize socket connection
  const initSocket = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!mountedRef.current) return;

      // Create socket connection with token for auth (if your server expects it)
      socketRef.current = io(SOCKET_URL, {
        transports: ['websocket'],
        auth: { token },
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      socketRef.current.on('connect', () => {
        console.log('Socket connected:', socketRef.current.id);
        // Optionally emit join with user id so server can send messages to this user
        // const userId = await AsyncStorage.getItem('user_id'); // if you store it
        // socketRef.current.emit('join', { userId });
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
      });

      socketRef.current.on('connect_error', (err) => {
        console.log('Socket connect_error:', err);
      });

      // Incoming message handler — adapt event name to your server ('message' is common)
      socketRef.current.on('message', (payload) => {
        // payload expected: { from: { _id, name, ... }, to, text, createdAt, ... }
        console.log('Socket message received:', payload);
        if (!mountedRef.current) return;

        // add to local messages state
        setMessages((prev) => [payload, ...prev]); // newest first

        // If currently viewing chat with this astrologer, navigate to chat screen with message
        const fromId = payload.from?._id || payload.from;
        const currentChatId = currentChatRef.current;
        if (currentChatId && fromId && currentChatId === fromId) {
          // If already on that person's chat, just navigate/update
          navigation.navigate('PersonToPersonChat', {
            person: payload.from,
            initialMessage: payload,
          });
        } else {
          // Not currently viewing this chat — show a small alert / notification
          // Replace this with your in-app notification or local push if you have one
          Alert.alert(
            payload.from?.name || 'New Message',
            payload.text || 'You have received a new message',
            [
              {
                text: 'Open',
                onPress: () => {
                  // navigate to chat with sender
                  navigation.navigate('PersonToPersonChat', {
                    person: payload.from,
                    initialMessage: payload,
                  });
                },
              },
              { text: 'Close', style: 'cancel' },
            ],
            { cancelable: true }
          );
        }
      });
    } catch (err) {
      console.log('initSocket error: ', err);
    }
  };



  useEffect(() => {
    mountedRef.current = true;

    // load astrologers and start socket
    (async () => {
      await getAllAstrologers();
      await initSocket();
    })();

    return () => {
      mountedRef.current = false;
      // clean up socket connection
      if (socketRef.current) {
        socketRef.current.off('message');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Called when user opens an astrologer profile / opens chat
  const handleAstrologerProfile = (item) => {
    navigation.navigate('AstrologerInfo', {
      person: item,
    });
  };

  // Called when user taps chat button in the list — sets the currentChatRef and navigates
  const handleChat = async (item) => {
    console.log('Starting chat with astrologer:', item._id);
    // set currently opened chat id so incoming socket messages can be handled accordingly
    currentChatRef.current = item._id;

    // Optionally, you might want to emit to server that user has opened chat (read/unread)
    try {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('open_chat', { with: item._id });
      }
    } catch (err) {
      console.log('emit open_chat error', err);
    }

    navigation.navigate('PersonToPersonChat', {
      person: item,
      // optionally pass any cached messages for this person
      cachedMessages: messages.filter(
        (m) => (m.from?._id === item._id) || (m.to?._id === item._id)
      ),
    });
  };

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await getAllAstrologers();
    setRefreshing(false);
  };

  const renderTabContent = () => {
    return (
      <Allastrologers
        actionButton={handleChat}
        data={specialAstro}
        handleAstrologer={handleAstrologerProfile}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    );
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
      {renderTabContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  container: {
    padding: scale(10),
    backgroundColor: COLORS.AstroSoftOrange,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(10),
    padding: scale(10),
    marginBottom: verticalScale(10),
    elevation: 2,
  },
  badge: {
    position: 'absolute',
    top: verticalScale(-10),
    left: scale(-10),
    backgroundColor: 'red',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(5),
    borderTopLeftRadius: moderateScale(10),
    borderBottomRightRadius: moderateScale(10),
  },
  badgeText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: scale(60),
    height: verticalScale(60),
    borderRadius: moderateScale(30),
    marginRight: scale(10),
  },
  details: {
    flex: 1,
  },
  name: {
    fontSize: moderateScale(16),
    color: 'black',
    fontWeight: 'bold',
  },
  specialization: {
    fontSize: moderateScale(14),
    color: '#666',
  },
  languages: {
    fontSize: moderateScale(12),
    color: '#666',
  },
  experience: {
    fontSize: moderateScale(12),
    color: '#666',
  },
  reviews: {
    fontSize: moderateScale(12),
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    textDecorationLine: 'line-through',
    fontSize: moderateScale(12),
    color: '#666',
  },
  offer: {
    fontSize: moderateScale(12),
    color: 'red',
    marginLeft: scale(5),
  },
  chatButton: {
    backgroundColor: '#00C853',
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(5),
  },
  chatText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#DBC2A9',
    paddingVertical: verticalScale(5),
    paddingHorizontal: scale(5),
  },
  tab: {
    paddingHorizontal: scale(10),
    marginLeft: scale(5),
    paddingVertical: verticalScale(5),
  },
  tabText: {
    color: 'black',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(13),
    paddingHorizontal: scale(10),
  },
  activeTab: {
    marginLeft: scale(5),
    borderWidth: moderateScale(1),
    borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(20),
    backgroundColor: 'white',
  },
  activeTabText: {
    paddingHorizontal: scale(10),
    color: 'black',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(13),
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    paddingVertical: verticalScale(10),
  },
  indicator: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: verticalScale(10),
  },
});

export default Chat;
