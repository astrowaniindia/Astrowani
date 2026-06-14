import React, {useCallback, useState, useEffect, useRef} from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import io from 'socket.io-client';
import Instance, {api} from '../api/ApiCall';

const SOCKET_URL = api;

const ChatScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();

  // params passed from previous screen
  const usersData = route?.params?.users || null; // contains clientId, sessionId etc.
  const userCustomer = route?.params?.user || null; // other participant object
  const room = route?.params?.roomId || null;

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null); // current logged-in user profile
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isModalVisible, setModalVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const socketRef = useRef(null);
  const textInputRef = useRef(null);
  const flatListRef = useRef(null);

  // --- fetch current user profile (returns promise so we can sequence calls) ---
  const fetchUserProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Token not found');

      const response = await Instance.get('/api/users/profile', {
        headers: {Authorization: `Bearer ${token}`},
      });

      if (response?.data?.data) {
        setUser(response.data.data);
        setLoading(false);
        return response.data.data;
      } else {
        setLoading(false);
        return null;
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setLoading(false);
      return null;
    }
  };

  // --- format messages helper ---
  const formatServerMessage = (message, currentUserId, otherUserId) => {
    // message: server message object (has _id, message, sender, createdAt)
    // Decide whether it's from current user or otherUser
    let senderType = 'other'; // default -> incoming (left)
    if (message.sender === 'System') {
      senderType = 'system';
    } else if (message.sender === currentUserId) {
      senderType = 'user'; // outgoing (right)
    } else if (message.sender === otherUserId) {
      senderType = 'other';
    } else {
      // fallback - treat as other if unknown
      senderType = message.sender === currentUserId ? 'user' : 'other';
    }

    return {
      id: message._id || `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: message.message,
      sender: senderType,
      time: new Date(message.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  };

  // --- get chat history from API ---
  const getHistoryMsg = async (currentUserId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const receiverId = usersData?.clientId; // other participant id
      const response = await Instance.get(
        `/api/chats/get-chats-user?receiver=${receiverId}`,
        {headers: {Authorization: `Bearer ${token}`}},
      );

      const result = response?.data?.data || [];
      console.log('📩 getHistory received count:', result.length);

      const formattedMessages = result.map(msg =>
        formatServerMessage(msg, currentUserId, usersData?.clientId),
      );

      setMessages(formattedMessages);
    } catch (error) {
      console.error('getHistoryMsg error:', error);
    }
  };

  const generateRoomId = (user1, user2) => {
    return [user1, user2].sort().join('_');
  };

  // --- initialize socket ---
  const initializeSocket = async (currentUserId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      console.log('🔌 Initializing socket connection...');

      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      socketRef.current = io(SOCKET_URL, {
        transports: ['websocket'],
        auth: {token},
      });

      const socket = socketRef.current;

      socket.on('connect', () => {
        console.log('✅ Socket connected with ID:', socket.id);
        setIsSocketConnected(true);

        // join a logical room if you use rooms on server
        if (room) {
          console.log('🚪 Emitting join_room for room:', room);
          // server may expect roomId or receiverId; adjust accordingly
          socket.emit('join_room', {roomId: room, receiverId: usersData?.clientId});
        } else if (usersData?.clientId && currentUserId) {
          const rid = generateRoomId(currentUserId, usersData.clientId);
          socket.emit('join_room', {roomId: rid, receiverId: usersData.clientId});
          console.log('🚪 Emitting join_room with generated roomId:', rid);
        }
      });

      socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
        setIsSocketConnected(false);
      });

      socket.on('connect_error', err => {
        console.error('❌ Socket connection error:', err?.message || err);
        setIsSocketConnected(false);
      });

      // receive message from socket
      socket.on('receiveMessage', (message) => {
        console.log('📩 Received message via socket:', message);
        // Use current user id to decide incoming/outgoing
        const currentUserIdLocal = currentUserId || user?._id;
        const newMessageObj = formatServerMessage(message, currentUserIdLocal, usersData?.clientId);

        // Avoid duplicates
        setMessages(prev => {
          const exists = prev.find(m => m.id === newMessageObj.id);
          if (exists) return prev;
          return [...prev, newMessageObj];
        });
      });

      socket.on('messageSent', data => {
        console.log('✅ Message sent confirmation:', data);
      });

      socket.on('error', error => {
        console.error('❌ Socket error:', error);
      });
    } catch (error) {
      console.error('❌ Socket initialization error:', error);
    }
  };

  // --- effect: fetch profile -> history -> socket ---
  useEffect(() => {
    let mounted = true;

    (async () => {
      const currentProfile = await fetchUserProfile();
      // if profile returned, use its _id; else try to get saved user id from AsyncStorage
      const currentUserId = currentProfile?._id || (await AsyncStorage.getItem('userId'));
      // fetch history with a reliable currentUserId
      await getHistoryMsg(currentUserId);
      // initialize socket with same id
      await initializeSocket(currentUserId);
    })();

    return () => {
      mounted = false;
      if (socketRef.current) {
        console.log('🧹 Cleaning up socket connection');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, usersData?.clientId]); // re-run when room or other participant changes

  // auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      // small delay to let FlatList layout
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({animated: true});
      }, 100);
    }
  }, [messages]);

  // --- send message ---
  const handleSend = async () => {
    if (!newMessage.trim()) return;

    if (!isSocketConnected || !socketRef.current) {
      Alert.alert('Error', 'Not connected to chat server. Please try again.');
      return;
    }

    const socket = socketRef.current;
    const messageText = newMessage.trim();

    // optimistic UI add
    const tempMessage = {
      id: `temp_${Date.now()}`,
      text: messageText,
      sender: 'user',
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');

    try {
      socket.emit('sendMessage', {
        roomId: generateRoomId(user?._id || (await AsyncStorage.getItem('userId')), usersData.clientId),
        sessionId: usersData.sessionId,
        receiver: usersData.clientId,
        message: messageText,
      });
      textInputRef.current?.focus();
      console.log('✅ Message emitted successfully');
    } catch (error) {
      console.error('❌ Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const renderMessage = ({item}) => {
    const isUser = item.sender === 'user';
    const isOther = item.sender === 'other';
    const isSystem = item.sender === 'system';

    if (isSystem) {
      return (
        <View style={styles.systemRow}>
          <Text style={styles.systemText}>{item.text}</Text>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.messageRow,
          isUser ? styles.messageRowRight : styles.messageRowLeft,
        ]}>
        {/* Left avatar for other */}
        {!isUser && (
          <Image
            source={{
              uri: userCustomer?.profilePic || 'https://via.placeholder.com/40',
            }}
            style={styles.avatarImage}
          />
        )}

        <View
          style={[
            styles.messageContainer,
            isUser ? styles.userMessage : styles.astrologerMessage,
          ]}>
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userMessageText : styles.astrologerMessageText,
            ]}>
            {item.text}
          </Text>
          <Text
            style={[
              styles.messageTime,
              isUser ? styles.userMessageTime : styles.astrologerMessageTime,
            ]}>
            {item.time}
          </Text>
        </View>

        {/* Right avatar for current user */}
        {isUser && (
          <View style={styles.userAvatar}>
            {user?.profilePic ? (
              <Image source={{uri: user.profilePic}} style={styles.avatarImage} />
            ) : (
              <Icon name="account-circle" size={32} color="#36438b" />
            )}
          </View>
        )}
      </View>
    );
  };

  const handleEndChat = () => {
    setModalVisible(true);
  };

  const handleSubmitReview = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Token not found');

      const response = await Instance.post(
        '/api/reviews/',
        {
          astrologerId: user._id,
          rating,
          comment: feedback,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data) {
        Alert.alert('Success', 'Review submitted successfully!');
        setModalVisible(false);
        navigation.goBack();
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Something went wrong!');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.userProfile}>
          <Image
            source={{
              uri: userCustomer?.profilePic || 'https://via.placeholder.com/40',
            }}
            style={styles.profileImage}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {userCustomer?.firstName} {userCustomer?.lastName}
            </Text>
            <Text style={styles.onlineStatus}>
              {isSocketConnected ? 'Online' : 'Connecting...'}
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={handleEndChat} style={styles.endChatButton}>
          <Text style={styles.endChatText}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Connection Status */}
      {!isSocketConnected && (
        <View style={styles.connectionStatus}>
          <Text style={styles.connectionStatusText}>Connecting to chat...</Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        inverted={false}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({animated: true})
        }
      />

      {/* Input Footer */}
      <View style={styles.footer}>
        <View style={styles.inputContainer}>
          <TextInput
            ref={textInputRef}
            style={styles.textInput}
            placeholder="Type your message..."
            placeholderTextColor="#999"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            editable={isSocketConnected}
          />
          <TouchableOpacity
            onPress={handleSend}
            style={[
              styles.sendButton,
              !isSocketConnected && styles.sendButtonDisabled,
            ]}
            disabled={!isSocketConnected}>
            <FontAwesome
              name="send"
              size={20}
              color={isSocketConnected ? '#fff' : '#999'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Review Modal */}
      <Modal visible={isModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}>
              <FontAwesome name="times" size={24} color="#36438b" />
            </TouchableOpacity>

            <Image
              source={{
                uri: user?.profilePic || 'https://via.placeholder.com/70',
              }}
              style={styles.modalProfileImage}
            />
            <Text style={styles.modalTitle}>{user?.name || 'Astrologer'}</Text>
            <Text style={styles.modalDescription}>
              How was your consultation? Your feedback helps us improve our service.
            </Text>

            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRating(star)}
                  style={styles.starButton}>
                  <FontAwesome
                    name={star <= rating ? 'star' : 'star-o'}
                    size={32}
                    color={star <= rating ? '#36438b' : '#ddd'}
              />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.feedbackInput}
              multiline
              placeholder="Share your experience (optional)"
              value={feedback}
              onChangeText={setFeedback}
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
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: 'white'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#36438b',
    padding: 16,
    elevation: 4,
  },
  userProfile: {flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 12},
  profileImage: {width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#fff'},
  userInfo: {marginLeft: 12},
  userName: {color: '#fff', fontSize: 16, fontWeight: '600'},
  onlineStatus: {color: '#a8e6cf', fontSize: 12},
  endChatButton: {backgroundColor: '#1a1e2d', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16},
  endChatText: {color: '#fff', fontSize: 12, fontWeight: '600'},
  connectionStatus: {backgroundColor: '#ff6b6b', padding: 8, alignItems: 'center'},
  connectionStatusText: {color: '#fff', fontSize: 12, fontWeight: '600'},
  messagesList: {paddingVertical: 8, paddingHorizontal: 10},
  // message rows
  messageRow: {flexDirection: 'row', alignItems: 'flex-end', marginVertical: 6},
  messageRowLeft: {justifyContent: 'flex-start'},
  messageRowRight: {justifyContent: 'flex-end'},
  messageContainer: {maxWidth: '70%', padding: 12, borderRadius: 16, marginHorizontal: 8},
  userMessage: {backgroundColor: '#25D366', borderTopRightRadius: 4, alignSelf: 'flex-end'},
  astrologerMessage: {backgroundColor: '#e5e5e5', borderTopLeftRadius: 4, alignSelf: 'flex-start'},
  avatarImage: {width: 32, height: 32, borderRadius: 16},
  userAvatar: {width: 32, height: 32, justifyContent: 'center', alignItems: 'center'},
  messageText: {fontSize: 14, lineHeight: 20},
  userMessageText: {color: '#fff'},
  astrologerMessageText: {color: '#121319'},
  messageTime: {fontSize: 10, marginTop: 4},
  userMessageTime: {color: 'rgba(255,255,255,0.7)', textAlign: 'right'},
  astrologerMessageTime: {color: '#666'},
  systemRow: {alignItems: 'center', marginVertical: 8},
  systemText: {backgroundColor: '#f0f0f0', padding: 8, borderRadius: 8, color: '#333'},
  footer: {padding: 12, backgroundColor: '#121319', flexDirection: 'row', alignItems: 'center'},
  inputContainer: {flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1e2d', borderRadius: 20, paddingHorizontal: 16},
  textInput: {flex: 1, color: '#fff', fontSize: 14, maxHeight: 100, paddingVertical: 8},
  sendButton: {width: 40, height: 40, borderRadius: 20, backgroundColor: '#25D366', justifyContent: 'center', alignItems: 'center'},
  sendButtonDisabled: {backgroundColor: '#666'},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(18, 19, 25, 0.9)', justifyContent: 'center', alignItems: 'center'},
  modalContent: {width: '90%', backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center'},
  closeButton: {position: 'absolute', top: 16, right: 16},
  modalProfileImage: {width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#36438b'},
  modalTitle: {fontSize: 20, fontWeight: '600', color: '#36438b', marginTop: 16},
  modalDescription: {fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, marginBottom: 24},
  starsContainer: {flexDirection: 'row', marginBottom: 24},
  starButton: {padding: 4},
  feedbackInput: {width: '100%', height: 120, backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 24, color: '#333', textAlignVertical: 'top'},
  submitButton: {backgroundColor: '#36438b', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 24},
  submitButtonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
});

export default ChatScreen;
