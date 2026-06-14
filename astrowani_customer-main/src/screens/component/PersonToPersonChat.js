import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance, {api} from '../../api/ApiCall';
import io from 'socket.io-client';
import {useNavigation} from '@react-navigation/native';

const SOCKET_URL = api;
const {width: SCREEN_WIDTH} = Dimensions.get('window');

const ChatScreen = ({route}) => {
  const navigation = useNavigation();
  const {person} = route.params;
  console.log(person, '&&&&&&&&&&&&&');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [roomId, setRoomId] = useState('');
  console.log(roomId, 'this is rooid');
  const [isModalVisible, setModalVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [session, setSession] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const flatListRef = useRef(null);
  const socketRef = useRef(null);
  const textInputRef = useRef(null);

  // Create or get session
  const handCreateSession = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return null;

      const checkSession = await AsyncStorage.getItem('sessionId');
      console.log(checkSession, '^^^^^^^^^^^');
      if (!checkSession) {
        const response = await Instance.post(
          `/api/sessions`,
          {
            sessionType: 'chat',
            astrologerId: person.userId,
            startTime: new Date(),
            chargePerMinute: person?.chatChargePerMinute,
          },
          {headers: {Authorization: `Bearer ${token}`}},
        );

        const sessionData = response.data?.data;
        if (sessionData) {
          setSession(sessionData);
          await AsyncStorage.setItem('sessionId', sessionData._id);
          return sessionData;
        }
        return null;
      } else {
        const sessionData = {_id: checkSession};
        setSession(sessionData);
        return sessionData;
      }
    } catch (error) {
      console.warn(
        'handCreateSession error',
        error?.response?.data || error.message,
      );
      if (error.response?.data?.message?.includes('No active plan')) {
        navigation.navigate('Wallet');
      }
      return null;
    }
  };

  // Load history with pagination
  const getHistoryMsg = async (page = 1, append = false) => {
    // Prevent multiple simultaneous requests
    if (loadingHistory && page > 1) return;

    try {
      setLoadingHistory(true);
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      // Add pagination parameters (assuming API supports page and limit)
      const response = await Instance.get(
        `/api/chats/get-chats-user?receiver=${person.userId}&page=${page}&limit=20`,
        {headers: {Authorization: `Bearer ${token}`}},
      );

      const result = response?.data?.data || [];
      const totalMessages = response?.data?.total || 0;
      const totalPages = response?.data?.totalPages || 1;

      // Map into UI-friendly items
      const formatted = result.map(message => ({
        id: message._id || String(Math.random()),
        text: message.message || '',
        sender:
          message.sender === 'System'
            ? 'system'
            : message.sender === person?.userId
            ? 'astrologer'
            : 'user',
        time: new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }));

      if (append) {
        // Append new messages to existing ones (for pagination)
        setMessages(prevMessages => [...formatted.reverse(), ...prevMessages]);
      } else {
        // Set messages in chronological order: oldest first
        setMessages(formatted.reverse());
      }

      // Check if there are more messages
      setHasMoreMessages(page < totalPages);
      setCurrentPage(page);

    } catch (error) {
      console.error(
        'getHistoryMsg error',
        error?.response?.data || error.message,
      );
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load more messages when scrolling to bottom
  const loadMoreMessages = () => {
    if (!loadingHistory && hasMoreMessages) {
      getHistoryMsg(currentPage + 1, true);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeChat = async () => {
      // Get current user ID first
      const userData = JSON.parse(await AsyncStorage.getItem('userData'));
      setCurrentUserId(userData?._id);
      console.log(userData,"userData@@@@@@@@@@@@@@@")

      const sessionData = await handCreateSession();
      if (!mounted || !sessionData) return;

      // Load history
      await getHistoryMsg(sessionData._id);

      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      // Connect socket
      socketRef.current = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        auth: {token},
        reconnectionAttempts: 5,
      });

      const socket = socketRef.current;

      socket.on('connect', async () => {
        console.log('Socket connected', socket.id);
        setIsConnected(true);
console.log(person.userId,"%%%%%%%%%%%%%%%")
console.log(userData._id,"******currentUserId")
        // Generate room ID locally by combining user IDs
        const room = [person.userId, userData._id].sort().join('_');
        setRoomId(room);
        console.log('Joining room:', room);
      socket.emit('join_room', {receiverId: person.userId});

      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
      });

      socket.on('connect_error', err => {
        console.error('connect_error', err?.message || err);
        setIsConnected(false);
      });

      socket.on('receiveMessage', message => {
        console.log('Received message:', message);

        // push new message to bottom (FlatList inverted)
        const msg = {
          id: message._id || String(Date.now()),
          text: message.message || '',
          sender:
            message.sender === 'System'
              ? 'system'
              : message.sender === person?.userId
              ? 'astrologer'
              : 'user',
          time: new Date(message.createdAt || Date.now()).toLocaleTimeString(
            [],
            {hour: '2-digit', minute: '2-digit'},
          ),
        };

        setMessages(prev => {
          // Check if message already exists to prevent duplicates
          const exists = prev.some(
            m =>
              m.id === msg.id ||
              (m.text === msg.text && m.sender === msg.sender),
          );
          if (exists) return prev;
          return [...prev, msg];
        });
      });

      socket.on('message', message => {
        console.log('Message event:', message);

        // push new message to bottom (FlatList inverted)
        const msg = {
          id: message._id || String(Date.now()),
          text: message.message || '',
          sender:
            message.sender === 'System'
              ? 'system'
              : message.sender === person?.userId
              ? 'astrologer'
              : 'user',
          time: new Date(message.createdAt || Date.now()).toLocaleTimeString(
            [],
            {hour: '2-digit', minute: '2-digit'},
          ),
        };

        setMessages(prev => {
          // Check if message already exists to prevent duplicates
          const exists = prev.some(
            m =>
              m.id === msg.id ||
              (m.text === msg.text && m.sender === msg.sender),
          );
          if (exists) return prev;
          return [...prev, msg];
        });
      });

      socket.on('error', err => {
        console.error('socket error', err);
      });

      // Catch all events for debugging
      socket.onAny((event, ...args) => {
        console.log('Socket received event:', event, args);
      });
    };

    initializeChat();

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [person.userId]);

  const handleSend = async () => {
    if (!newMessage.trim() || !isConnected || !roomId || !session) {
      Alert.alert('Error', 'Cannot send message. Check connection or session.');
      return;
    }

    try {
      const payload = {
        roomId,
        sessionId: session._id,
        receiver: person.userId,
        message: newMessage.trim(),
      };
console.log(payload,"********************")
      socketRef.current.emit('sendMessage', payload);

      // Optimistic UI: show local message immediately
      const localMsg = {
        id: String(Date.now()),
        text: newMessage.trim(),
        sender: 'user',
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setMessages(p => [...p, localMsg]);
      setNewMessage('');

      // keep input focused
      textInputRef.current?.focus();
    } catch (error) {
      console.error('send error', error);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const handleEndChat = () => setModalVisible(true);

  const handleSubmitReview = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('No token');

      await Instance.post(
        '/api/reviews/',
        {astrologerId: person._id, rating, comment: feedback},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      await handleEndSession();
      Alert.alert('Success', 'Review submitted');
    } catch (e) {
      console.error('submit review error', e?.response?.data || e.message);
      Alert.alert(
        'Error',
        e?.response?.data?.message || 'Failed to submit review',
      );
    } finally {
      setModalVisible(false);
    }
  };

  const handleEndSession = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token || !session) return;

      await Instance.put(
        `/api/sessions/${session._id}`,
        {status: 'completed', astrologerId: person._id, endTime: new Date()},
        {headers: {Authorization: `Bearer ${token}`}},
      );

      await AsyncStorage.removeItem('sessionId');
      navigation.goBack();
    } catch (error) {
      console.error('endSession error', error?.response?.data || error.message);
    }
  };

  // Render a single message
  const renderMessage = ({item}) => {
    const isUser = item.sender === 'user';
    const isSystem = item.sender === 'system';

    const bubbleStyle = isSystem
      ? styles.systemMessage
      : isUser
      ? styles.userMessage
      : styles.astrologerMessage;

    const textStyle = isSystem
      ? styles.systemText
      : isUser
      ? styles.userText
      : styles.astrologerText;

    return (
      <View
        style={[
          styles.messageRow,
          isUser
            ? {justifyContent: 'flex-end'}
            : {justifyContent: 'flex-start'},
        ]}>
        <View
          style={[
            styles.messageBubble,
            bubbleStyle,
            {maxWidth: SCREEN_WIDTH * 0.75},
          ]}>
          <Text style={[styles.messageText, textStyle]}>{item.text}</Text>
          <Text style={styles.messageTime}>{item.time}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.userProfile}>
            <Icon name="account-circle" size={44} color="#fff" />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{person.name || 'Unknown'}</Text>
              <Text style={styles.connectionStatus}>
                {isConnected ? 'Connected' : 'Connecting...'}
              </Text>
            </View>
          </View>

          <View style={styles.headerButtons}>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('EnxJoinScreen', {userId: person.userId})
              }
              style={styles.callButton}>
              <Text style={styles.callText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleEndChat}
              style={styles.endChatButton}>
              <Text style={styles.endChatText}>End</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          // inverted={false} // show newest at bottom
          contentContainerStyle={styles.messagesList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.emptyText}>No messages yet — say hi 👋</Text>
          }
          ListFooterComponent={
            loadingHistory ? (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.loadingText}>Loading more messages...</Text>
              </View>
            ) : null
          }
          onEndReached={loadMoreMessages}
          onEndReachedThreshold={0.1}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({animated: true})
          }
          onLayout={() => flatListRef.current?.scrollToEnd({animated: true})}
        />

        {/* Input area */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.mediaButton} activeOpacity={0.7}>
            <FontAwesome name="paperclip" size={22} />
          </TouchableOpacity>

          <TextInput
            ref={textInputRef}
            style={styles.textInput}
            placeholder="Type a message"
            value={newMessage}
            onChangeText={setNewMessage}
            onSubmitEditing={handleSend}
            editable={isConnected}
            placeholderTextColor="#666"
            returnKeyType="send"
          />

          <TouchableOpacity
            onPress={handleSend}
            disabled={!isConnected || !newMessage.trim()}
            style={styles.sendButton}>
            <FontAwesome
              name="send"
              size={22}
              color={!isConnected || !newMessage.trim() ? '#bbb' : '#007AFF'}
            />
          </TouchableOpacity>
        </View>

        {/* Feedback Modal */}
        <Modal visible={isModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}>
                <FontAwesome name="times-circle" size={24} />
              </TouchableOpacity>

              <Image
                source={{
                  uri: person.profileImage || 'https://via.placeholder.com/80',
                }}
                style={styles.profileImage}
              />
              <Text style={styles.title}>{person.name || 'Astrologer'}</Text>
              <Text style={styles.description}>
                Please take a moment to give us your feedback.
              </Text>

              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map(s => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setRating(s)}
                    style={styles.starpress}>
                    <FontAwesome
                      name={s <= rating ? 'star' : 'star-o'}
                      size={28}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.feedbackInput}
                multiline
                onChangeText={setFeedback}
                numberOfLines={4}
                placeholder="Describe your feedback (optional)"
              />

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSubmitReview}>
                <Text style={styles.submitButtonText}>Submit Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F6F7FB'},
  container: {flex: 1},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: 12,
    backgroundColor: '#7B1E2D',
  },
  userProfile: {flexDirection: 'row', alignItems: 'center'},
  userInfo: {marginLeft: 10},
  userName: {color: '#fff', fontWeight: '700', fontSize: 16},
  connectionStatus: {color: '#fff', fontSize: 12, opacity: 0.9},
  headerButtons: {flexDirection: 'row', alignItems: 'center'},
  callButton: {
    backgroundColor: '#06b954',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 8,
  },
  callText: {color: '#fff', fontWeight: '600'},
  endChatButton: {
    backgroundColor: '#FFD166',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  endChatText: {color: '#000', fontWeight: '600'},

  messagesList: {paddingHorizontal: 12, paddingVertical: 8, flexGrow: 1},
  emptyText: {textAlign: 'center', color: '#666', padding: 16},
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },

  messageRow: {flexDirection: 'row', marginVertical: 6},
  messageBubble: {padding: 10, borderRadius: 12},
  userMessage: {
    backgroundColor: '#fff',
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 12,
  },
  astrologerMessage: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 4,
    borderBottomRightRadius: 12,
  },
  systemMessage: {backgroundColor: '#eee', alignSelf: 'center'},
  messageText: {fontSize: 15, color: '#111'},
  userText: {color: '#111'},
  astrologerText: {color: '#111'},
  systemText: {color: '#333', fontStyle: 'italic'},
  messageTime: {
    fontSize: 11,
    color: '#666',
    marginTop: 6,
    alignSelf: 'flex-end',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#fff',
    borderTopColor: '#eee',
    borderTopWidth: 1,
  },
  mediaButton: {padding: 8},
  textInput: {
    flex: 1,
    backgroundColor: '#F2F2F2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    fontSize: 15,
    color: '#000',
  },
  sendButton: {padding: 8, marginLeft: 8},

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 18,
    alignItems: 'center',
  },
  closeButton: {position: 'absolute', top: 12, right: 12},
  profileImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginTop: -48,
    marginBottom: 8,
  },
  title: {fontSize: 18, fontWeight: '700', marginTop: 8},
  description: {textAlign: 'center', color: '#333', marginVertical: 8},
  starsContainer: {flexDirection: 'row', marginVertical: 8},
  starpress: {paddingHorizontal: 6},
  feedbackInput: {
    width: '100%',
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#E6E6E6',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    color: '#000',
  },
  submitButton: {
    width: '100%',
    paddingVertical: 12,
    backgroundColor: '#7B1E2D',
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  submitButtonText: {color: '#fff', fontWeight: '700'},
});

export default ChatScreen;
