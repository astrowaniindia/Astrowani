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
import { supabase } from '../../api/SupabaseClient';

const Chat = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState('');
  const [astrologer, setAstrologer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [specialAstro, setSpecialAstro] = useState([]);
  const [messages, setMessages] = useState([]); // store incoming messages
  const mountedRef = useRef(true);
  const currentChatRef = useRef(null); // track current opened astrologer id
  const channelRef = useRef(null);

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

  // Initialize Supabase realtime connection for global incoming messages
  const initSocket = async () => {
    try {
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr) return;
      const userData = JSON.parse(userDataStr);
      const myId = userData?._id;
      if (!myId || !mountedRef.current) return;

      channelRef.current = supabase.channel(`user_inbox_${myId}`);

      channelRef.current
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `receiver_id=eq.${myId}` },
          (payload) => {
            const messageRow = payload.new;
            console.log('Supabase real-time incoming message:', messageRow);
            if (!mountedRef.current) return;

            // Formulate payload to match old UI expectations
            const incomingMsg = {
              from: { _id: messageRow.sender_id }, // We only have sender_id from db trigger, not full object. In real app, you might fetch sender profile.
              to: messageRow.receiver_id,
              text: messageRow.message,
              createdAt: messageRow.created_at
            };

            setMessages((prev) => [incomingMsg, ...prev]);

            const currentChatId = currentChatRef.current;
            if (currentChatId && currentChatId === messageRow.sender_id) {
              // Already looking at this chat, the PersonToPersonChat screen will handle it
              return;
            } else {
              Alert.alert(
                'New Message',
                messageRow.message,
                [
                  {
                    text: 'Open Chat',
                    onPress: () => {
                      // Attempt to find full sender info from astrologers list
                      const senderProfile = specialAstro.find(a => a.userId === messageRow.sender_id) || { userId: messageRow.sender_id };
                      navigation.navigate('PersonToPersonChat', {
                        person: senderProfile,
                        initialMessage: incomingMsg,
                      });
                    },
                  },
                  { text: 'Close', style: 'cancel' },
                ],
                { cancelable: true }
              );
            }
          }
        )
        .subscribe();

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
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  // Called when user opens an astrologer profile / opens chat
  const handleAstrologerProfile = (item) => {
    navigation.navigate('AstrologerInfo', {
      person: item,
    });
  };

  const handleChat = async (item) => {
    console.log('Starting chat with astrologer:', item._id);
    currentChatRef.current = item.userId;

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
