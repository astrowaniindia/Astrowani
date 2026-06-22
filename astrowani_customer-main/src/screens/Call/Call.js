// // import {StyleSheet, Text, View, ActivityIndicator} from 'react-native';
// // import React, {useEffect, useState} from 'react';
// // import ReusableList from '../component/ReusableList';
// // import Instance from '../../api/ApiCall';
// // import AsyncStorage from '@react-native-async-storage/async-storage';
// // import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
// // import {COLORS} from '../../Theme/Colors';

// // const Call = ({navigation}) => {
// //   const [astrologer, setAstrologer] = useState(null);
// //   const [loading, setLoading] = useState(true);
// //   const [error, setError] = useState(null);

// //   useEffect(() => {
// //     const fetchAstrologer = async () => {
// //       try {
// //         const token = await AsyncStorage.getItem('token');
// //         if (!token) throw new Error('Token not found');

// //         const response = await Instance.get('/api/astrologers', {
// //           headers: {Authorization: token},
// //         });
// //         console.log("api repsonse is coming as", )
// //         setAstrologer(response.data.data);
// //         console.log('chat');
// //       } catch (err) {
// //         setError(err.message);
// //       } finally {
// //         setLoading(false);
// //       }
// //     };
// //     fetchAstrologer();
// //   }, []);

// //   const handleCall = () => {};
// //   const handleAstrologer = item => {
// //     navigation.navigate('AstrologerInfo', {
// //       person: item,
// //     });
// //   };

// //   if (loading) {
// //     return (
// //       <View style={styles.indicator}>
// //         <ActivityIndicator size="small" color={COLORS.primary} />
// //       </View>
// //     );
// //   }

// //   if (error) {
// //     return <Text style={styles.errorText}>Error: {error}</Text>;
// //   }
// //   return (
// //     <ReusableList
// //       data={astrologer}
// //       handleAstrologer={handleAstrologer}
// //       actionButton={handleCall}
// //       buttonType="call"
// //     />
// //   );
// // };

// // export default Call;

// // const styles = StyleSheet.create({
// //   errorText: {
// //     color: 'red',
// //     textAlign: 'center',
// //     paddingVertical: verticalScale(10),
// //   },
// //   indicator: {
// //     flex: 1,
// //     alignItems: 'center',
// //     justifyContent: 'center',
// //     marginVertical: verticalScale(10),
// //   },
// // });

// // import React, { useState, useEffect } from 'react';
// // import { StyleSheet, View, FlatList, Text, TouchableOpacity } from 'react-native';
// // import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
// // import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
// // import FastImage from 'react-native-fast-image';

// // const CallsList = ({ navigation }) => {
// //   const [calls, setCalls] = useState([]);
// //   const [filteredCalls, setFilteredCalls] = useState([]);
// //   const [showMissedOnly, setShowMissedOnly] = useState(false);

// //   useEffect(() => {
// //     // Sample data for calls
// //     const sampleCalls = [
// //       { id: 1, name: 'Miles T Tone', timestamp: 'Sun 17, 08:15 am', isMissed: false, isVideoCall: false },
// //       { id: 2, name: 'Hanson Deck', timestamp: 'Sun 17, 09:45 am', isMissed: true, isVideoCall: true },
// //       { id: 3, name: 'Fergus Douchebag', timestamp: 'Sat 16, 07:30 pm', isMissed: false, isVideoCall: false },
// //       { id: 4, name: 'Spruce Springclean', timestamp: 'Sat 16, 05:08 pm', isMissed: false, isVideoCall: true },
// //       { id: 5, name: 'Jason Response', timestamp: 'Fri 15, 11:10 am', isMissed: false, isVideoCall: false },
// //       { id: 6, name: 'Pitt Jenkins', timestamp: 'Fri 15, 09:17 am', isMissed: true, isVideoCall: false },
// //       { id: 7, name: 'Russell Sprout', timestamp: 'Thu 14, 08:23 pm', isMissed: true, isVideoCall: true },
// //       { id: 8, name: 'Girth Wiedenbauer', timestamp: 'Wed 13, 04:00 pm', isMissed: false, isVideoCall: false },
// //     ];
// //     setCalls(sampleCalls);
// //   }, []);

// //   useEffect(() => {
// //     filterCalls();
// //   }, [calls, showMissedOnly]);

// //   const filterCalls = () => {
// //     let filtered = calls;
// //     if (showMissedOnly) {
// //       filtered = filtered.filter(call => call.isMissed);
// //     }
// //     setFilteredCalls(filtered);
// //   };

// //   const renderCallStatusIcon = (isMissed) => {
// //     const iconName = isMissed ? 'call-missed' : 'call-received';
// //     const iconColor = isMissed ? '#FF3B30' : '#34C759';
// //     return (
// //       <MaterialIcons
// //         name={iconName}
// //         size={moderateScale(16)}
// //         color={iconColor}
// //         style={styles.statusIcon}
// //       />
// //     );
// //   };

// //   const renderCallTypeIcon = (isVideoCall) => {
// //     const iconName = isVideoCall ? 'videocam' : 'call';
// //     return (
// //       <MaterialIcons
// //         name={iconName}
// //         size={moderateScale(24)}
// //         color="#8E8E93"
// //         style={styles.callTypeIcon}
// //       />
// //     );
// //   };

// //   const renderItem = ({ item }) => (
// //     <TouchableOpacity style={styles.callItem}>
// //       <FastImage
// //         source={{ uri: `https://randomuser.me/api/portraits/${item.id % 2 ? 'women' : 'men'}/${item.id}.jpg` }}
// //         style={styles.avatar}
// //       />
// //       <View style={styles.callInfo}>
// //         <Text style={styles.name}>{item.name}</Text>
// //         <View style={styles.callDetails}>
// //           {renderCallStatusIcon(item.isMissed)}
// //           <Text style={styles.timestamp}>{item.timestamp}</Text>
// //         </View>
// //       </View>
// //       {renderCallTypeIcon(item.isVideoCall)}
// //     </TouchableOpacity>
// //   );

// //   return (
// //     <View style={styles.container}>
// //       <View style={styles.filterContainer}>
// //         <TouchableOpacity
// //           style={[styles.filterButton, !showMissedOnly && styles.activeFilter]}
// //           onPress={() => setShowMissedOnly(false)}
// //         >
// //           <Text style={[styles.filterText, !showMissedOnly && styles.activeFilterText]}>All</Text>
// //         </TouchableOpacity>
// //         <TouchableOpacity
// //           style={[styles.filterButton, showMissedOnly && styles.activeFilter]}
// //           onPress={() => setShowMissedOnly(true)}
// //         >
// //           <Text style={[styles.filterText, showMissedOnly && styles.activeFilterText]}>Missed</Text>
// //         </TouchableOpacity>
// //       </View>
// //       <FlatList
// //         data={filteredCalls}
// //         renderItem={renderItem}
// //         keyExtractor={item => item.id.toString()}
// //         contentContainerStyle={styles.listContainer}
// //       />
// //     </View>
// //   );
// // };

// // const styles = StyleSheet.create({
// //   container: {
// //     flex: 1,
// //     backgroundColor: '#FFFFFF',
// //   },
// //   filterContainer: {
// //     flexDirection: 'row',
// //     justifyContent: 'center',
// //     paddingVertical: verticalScale(4),
// //     paddingHorizontal: scale(4),
// //     backgroundColor: '#FFFFFF',
// //     borderRadius: 25,
// //     marginHorizontal: scale(15),
// //     marginTop: verticalScale(15),
// //     shadowColor: "#000",
// //     shadowOffset: {
// //       width: 0,
// //       height: 2,
// //     },
// //     shadowOpacity: 0.1,
// //     shadowRadius: 4,
// //     elevation: 5,
// //   },
// //   filterButton: {
// //     paddingHorizontal: scale(20),
// //     paddingVertical: verticalScale(8),
// //     borderRadius: 20,
// //     flex: 1,
// //     alignItems: 'center',
// //   },
// //   activeFilter: {
// //     backgroundColor: '#007AFF',
// //   },
// //   filterText: {
// //     fontSize: moderateScale(14),
// //     fontWeight: '600',
// //     color: '#8E8E93',
// //   },
// //   activeFilterText: {
// //     color: '#FFFFFF',
// //   },
// //   listContainer: {
// //     paddingVertical: verticalScale(10),
// //   },
// //   callItem: {
// //     flexDirection: 'row',
// //     alignItems: 'center',
// //     paddingHorizontal: scale(15),
// //     paddingVertical: verticalScale(10),
// //   },
// //   avatar: {
// //     width: scale(50),
// //     height: scale(50),
// //     borderRadius: scale(25),
// //     marginRight: scale(15),
// //   },
// //   callInfo: {
// //     flex: 1,
// //   },
// //   name: {
// //     fontSize: moderateScale(16),
// //     fontWeight: '600',
// //     color: '#000000',
// //     marginBottom: verticalScale(4),
// //   },
// //   callDetails: {
// //     flexDirection: 'row',
// //     alignItems: 'center',
// //   },
// //   statusIcon: {
// //     marginRight: scale(8),
// //   },
// //   timestamp: {
// //     fontSize: moderateScale(14),
// //     color: '#8E8E93',
// //   },
// //   callTypeIcon: {
// //     marginLeft: scale(10),
// //   },
// // });

// // export default CallsList;

// import React, { useState, useEffect } from 'react';
// import { StyleSheet, View, FlatList, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
// import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
// import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
// import FastImage from 'react-native-fast-image';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import axios from 'axios';

// const CallsList = ({ navigation }) => {
//   const [calls, setCalls] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [filteredCalls, setFilteredCalls] = useState([]);
//   const [showMissedOnly, setShowMissedOnly] = useState(false);

//   useEffect(() => {
//     fetchCalls();
//   }, []);

//   useEffect(() => {
//     filterCalls();
//   }, [calls, showMissedOnly]);

//   const filterCalls = () => {
//     let filtered = calls;
//     if (showMissedOnly) {
//       filtered = filtered.filter(call => call.isMissed);
//     }
//     setFilteredCalls(filtered);
//   };

//   const fetchCalls = async () => {
//     try {
//       setLoading(true);
//       const token = await AsyncStorage.getItem('token');
//       const response = await axios.get('https://astrology-3bjo.onrender.com/api/call/call-history', {
//         headers: {
//           Authorization: `Bearer ${token}`,
//         },
//       });
//       if (response?.data?.data) {
//         setCalls(response.data.data);
//       }
//     } catch (error) {
//       console.error('Error fetching calls:', error);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const renderCallTypeIcon = (isVideoCall) => {
//     const iconName = isVideoCall ? 'videocam' : 'call';
//     return (
//       <MaterialIcons
//         name={iconName}
//         size={moderateScale(24)}
//         color="#8E8E93"
//         style={styles.callTypeIcon}
//       />
//     );
//   };

//   const renderItem = ({ item }) => (
//     <TouchableOpacity style={styles.callItem}>
//       <FastImage
//         source={{ uri: item.profileImage || 'https://via.placeholder.com/50' }}
//         style={styles.avatar}
//         defaultSource={require('../../assets/images/Avatar.jpg')}
//       />
//       <View style={styles.callInfo}>
//         <Text style={styles.name}>
//           {`${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Unknown Astrologer'}
//         </Text>
//         {/* <View style={styles.callDetails}>
//           <Text style={styles.timestamp}>{new Date(item.callStartTime).toLocaleString()}</Text>
//         </View> */}
//       </View>
//       {renderCallTypeIcon(false)}
//     </TouchableOpacity>
//   );

//   const renderContent = () => {
//     if (loading) {
//       return (
//         <View style={styles.loadingContainer}>
//           <ActivityIndicator size="large" color="#0000ff" />
//           <Text>Loading...</Text>
//         </View>
//       );
//     }

//     if (filteredCalls.length === 0) {
//       return (
//         <View style={styles.noCallsContainer}>
//           <Text style={styles.noCallsText}>No calls found</Text>
//         </View>
//       );
//     }

//     return (
//       <FlatList
//         data={filteredCalls}
//         renderItem={renderItem}
//         keyExtractor={item => item._id}
//         contentContainerStyle={styles.listContainer}
//       />
//     );
//   };

//   return (
//     <View style={styles.container}>
//       {/* <View style={styles.filterContainer}>
//         <TouchableOpacity
//           style={[styles.filterButton, !showMissedOnly && styles.activeFilter]}
//           onPress={() => setShowMissedOnly(false)}
//         >
//           <Text style={[styles.filterText, !showMissedOnly && styles.activeFilterText]}>All</Text>
//         </TouchableOpacity>
//         <TouchableOpacity
//           style={[styles.filterButton, showMissedOnly && styles.activeFilter]}
//           onPress={() => setShowMissedOnly(true)}
//         >
//           <Text style={[styles.filterText, showMissedOnly && styles.activeFilterText]}>Missed</Text>
//         </TouchableOpacity>
//       </View> */}
//       {renderContent()}
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#FFFFFF',
//   },
//   listContainer: {
//     paddingVertical: verticalScale(10),
//   },
//   callItem: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     paddingHorizontal: scale(15),
//     paddingVertical: verticalScale(10),
//   },
//   avatar: {
//     width: scale(50),
//     height: scale(50),
//     borderRadius: scale(25),
//     marginRight: scale(15),
//   },
//   callInfo: {
//     flex: 1,
//   },
//   name: {
//     fontSize: moderateScale(16),
//     fontWeight: '600',
//     color: '#000000',
//     marginBottom: verticalScale(4),
//   },
//   callDetails: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   timestamp: {
//     fontSize: moderateScale(14),
//     color: '#8E8E93',
//   },
//   callTypeIcon: {
//     marginLeft: scale(10),
//   },
//   loadingContainer: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   noCallsContainer: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   noCallsText: {
//     fontSize: moderateScale(16),
//     color: '#8E8E93',
//   },

//     filterContainer: {
//     flexDirection: 'row',
//     justifyContent: 'center',
//     paddingVertical: verticalScale(4),
//     paddingHorizontal: scale(4),
//     backgroundColor: '#edede9',
//     borderRadius: 12,
//     marginHorizontal: scale(15),
//     marginTop: verticalScale(15),

//   },
//   filterButton: {
//     paddingHorizontal: scale(20),
//     paddingVertical: verticalScale(8),
//     borderRadius: 20,
//     flex: 1,
//     alignItems: 'center',

//   },
//   activeFilter: {
//     backgroundColor: '#ffff',
//     shadowColor: "#000",
//     shadowOffset: {
//       width: 0,
//       height: 2,
//     },
//     shadowOpacity: 0.1,
//     shadowRadius: 4,
//     elevation: 5,
//   },
//   filterText: {
//     fontSize: moderateScale(14),
//     fontWeight: '600',
//     color: '#8E8E93',
//   },
//   activeFilterText: {
//     color: '#007AFF',
//   },
// });

// export default CallsList;

import React, {useState, useEffect, useRef, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  StyleSheet,
  View,
  FlatList,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import FastImage from 'react-native-fast-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StarRating from '../../components/StarRating';
import { ensureProfileComplete } from '../../utils/profileGate';
import axios from 'axios';
import {COLORS} from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import ReusableList from '../component/ReusableList';
import { supabase } from '../../api/SupabaseClient';
import { showStatusPopup } from '../../components/StatusPopup';
import { SOCKET_URL } from '../../config/api';
import io from 'socket.io-client';

const CallsList = ({navigation}) => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filteredCalls, setFilteredCalls] = useState([]);
  const [showMissedOnly, setShowMissedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingAstroName, setWaitingAstroName] = useState('');

  // Mount-time socket — stays connected for the component's lifetime so
  // call_accepted arrives reliably even if vendor accepts within seconds.
  const socketRef = useRef(null);
  const callChannelRef = useRef(null);
  // navigatedRef is set true when a call is resolved (navigate/cancel/timeout)
  // so any stale async handler is ignored.
  const navigatedRef = useRef(false);
  // Tracks the in-flight request so cancel/back marks it cancelled + notifies the vendor
  const activeCallRef = useRef(null);

  // Notify the vendor that the customer abandoned the pending request (dismisses their popup)
  // status: 'cancelled' (user abandoned) | 'missed' (timeout) | 'rejected' (vendor declined — don't overwrite)
  const notifyVendorCancelled = (status = 'cancelled') => {
    const active = activeCallRef.current;
    activeCallRef.current = null;
    if (!active?.requestId) return;
    if (status !== 'rejected') {
      supabase
        .from('call_requests')
        .update({status})
        .eq('id', active.requestId)
        .then(() => {}, () => {});
    }
    socketRef.current?.emit('cancel_call', {
      astrologer_id: active.astrologerId,
      requestId: active.requestId,
      roomId: active.roomId,
    });
  };

  useEffect(() => {
    const setup = async () => {
      socketRef.current = io(SOCKET_URL);
      socketRef.current.on('connect', async () => {
        console.log('[CallScreen] Socket connected:', socketRef.current.id);
        const userStr = await AsyncStorage.getItem('userData');
        const user = userStr ? JSON.parse(userStr) : null;
        if (user?.id) {
          socketRef.current.emit('join_room', user.id);
          console.log('[CallScreen] Joined personal room:', user.id);
        }
      });
      socketRef.current.on('connect_error', err =>
        console.error('[CallScreen] Socket error:', err.message),
      );
    };
    setup();
    return () => {
      if (callChannelRef.current) supabase.removeChannel(callChannelRef.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    filterCalls();
  }, [calls, showMissedOnly, searchQuery]);

  const filterCalls = () => {
    let filtered = calls;
    if (showMissedOnly) {
      filtered = filtered.filter(call => call.isMissed);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => {
        const nameMatch = `${item.name || ''} ${item.lastName || ''}`.toLowerCase().includes(query);
        return nameMatch;
      });
    }
    setFilteredCalls(filtered);
  };

  const cancelCall = () => {
    navigatedRef.current = true;
    notifyVendorCancelled(); // dismiss the vendor's incoming-call popup
    if (callChannelRef.current) {
      supabase.removeChannel(callChannelRef.current);
      callChannelRef.current = null;
    }
    // Remove only per-call listeners; keep the socket alive for the next call
    socketRef.current?.off('call_accepted');
    socketRef.current?.off('call_rejected');
    setIsWaiting(false);
  };

  const getRoomTokenWebCall = async (item) => {
    try {
      if (!(await ensureProfileComplete(navigation))) return;
      const token = await AsyncStorage.getItem('token');
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr || !token) {
        Alert.alert('Error', 'Please login to continue.');
        return;
      }
      const userEntireData = JSON.parse(userDataStr);

      const pricePerMin = item.chargePerMinute || item.pricing || 15;
      const minRequired = pricePerMin * 5;

      const {data: customer, error: walletErr} = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('id', userEntireData.id)
        .single();

      if (walletErr) {
        Alert.alert('Error', 'Failed to verify wallet balance.');
        return;
      }
      if (customer.wallet_balance < minRequired) {
        Alert.alert(
          'Insufficient Balance',
          `You need at least ₹${minRequired} to connect. Current balance: ₹${customer.wallet_balance}. Please recharge.`,
        );
        return;
      }

      setIsWaiting(true);
      setWaitingAstroName(item.name);
      navigatedRef.current = false;

      const response = await axios.post(
        `${SOCKET_URL}/api/call/initiate`,
        {receiverId: item.userId, callType: 'audio', callerRole: 'customer'},
        {headers: {Authorization: `Bearer ${token}`}},
      );

      if (response.status !== 200) {
        setIsWaiting(false);
        Alert.alert('Error', 'Failed to initiate call.');
        return;
      }

      const callerToken =
        response.data.data?.token?.token ||
        response.data.token?.token ||
        response.data.token;
      const vendorToken =
        response.data.data?.vendorToken || response.data.vendorToken;
      const roomId = response.data.data?.roomId || response.data.roomId;
      const backendSessionId =
        response.data.data?.sessionId || response.data.sessionId;

      const {data: requestData, error: reqErr} = await supabase
        .from('call_requests')
        .insert([{
          customer_id: userEntireData.id,
          astrologer_id: item.userId,
          customer_name: userEntireData.name || 'Customer',
          call_type: 'audio',
          status: 'pending',
          room_id: roomId,
          room_token: vendorToken,
        }])
        .select()
        .single();

      if (reqErr) {
        setIsWaiting(false);
        Alert.alert('Error', 'Failed to send call request.');
        return;
      }

      // Track the pending request so cancel/timeout can notify the vendor to dismiss its popup
      activeCallRef.current = { requestId: requestData.id, astrologerId: item.userId, roomId };

      const goToCall = dbSessionId => {
        if (navigatedRef.current) return;
        navigatedRef.current = true;
        activeCallRef.current = null; // accepted → don't cancel
        if (callChannelRef.current) {
          supabase.removeChannel(callChannelRef.current);
          callChannelRef.current = null;
        }
        socketRef.current?.off('call_accepted');
        socketRef.current?.off('call_rejected');
        setIsWaiting(false);
        navigation.navigate('VoiceCallScreen', {
          token: callerToken,
          sessionId: dbSessionId || backendSessionId,
          recieverName: item.name,
          recieverImage: item.profileImage || '',
          recieverId: item.userId || item._id,
        });
      };

      const cleanupAndAlert = (msg, status = 'cancelled', title = 'Call Ended') => {
        if (navigatedRef.current) return;
        navigatedRef.current = true;
        notifyVendorCancelled(status); // dismiss the vendor's incoming-call popup
        if (callChannelRef.current) {
          supabase.removeChannel(callChannelRef.current);
          callChannelRef.current = null;
        }
        socketRef.current?.off('call_accepted');
        socketRef.current?.off('call_rejected');
        setIsWaiting(false);
        if (msg) {
          showStatusPopup({
            title,
            message: msg,
            variant: status === 'missed' ? 'missed' : status === 'rejected' ? 'busy' : 'info',
          });
        }
      };

      // Socket listeners — mount-time socket is already connected and in customer's room
      socketRef.current?.once('call_accepted', data => goToCall(data.sessionId));
      socketRef.current?.on('call_rejected', () =>
        cleanupAndAlert('Astrologer is busy right now. Please try again after some time.', 'rejected', 'Astrologer Busy'),
      );

      // Supabase Realtime backup (catches acceptance even if socket misses it)
      const channel = supabase
        .channel(`call_request_callscreen_${requestData.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'call_requests',
            filter: `id=eq.${requestData.id}`,
          },
          payload => {
            if (payload.new.status === 'accepted') {
              goToCall(payload.new.session_id);
            } else if (payload.new.status === 'rejected') {
              cleanupAndAlert('Astrologer is busy right now. Please try again after some time.', 'rejected', 'Astrologer Busy');
            }
          },
        )
        .subscribe();
      callChannelRef.current = channel;

      // Auto-cancel after 1 minute if vendor doesn't respond → missed call
      setTimeout(() => {
        cleanupAndAlert('Your audio call was not picked up. Please try again later.', 'missed', 'Not Answered');
      }, 60000);
    } catch (err) {
      setIsWaiting(false);
      console.error('[CallScreen] getRoomTokenWebCall error:', err);
      Alert.alert('Error', 'Failed to initiate call. Please try again.');
    }
  };
  const fetchCalls = useCallback(async () => {
    try {
      setLoading(true);
      // Show ALL astrologers — the Call button reflects is_call_enabled per card
      // (red "Unavailable" when off) rather than hiding the astrologer.
      const response = await Instance.get('/api/astrologers');
      if (response?.data.data) {
        setCalls(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch on focus + live sync on any astrologer change
  useFocusEffect(
    useCallback(() => {
      fetchCalls();
    }, [fetchCalls]),
  );

  useEffect(() => {
    // Unique name per run — a fixed name makes supabase.channel() return an already-
    // subscribed channel and .on()-after-subscribe() throws.
    const channel = supabase
      .channel(`talk-astro-list-${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'astrologers'},
        () => fetchCalls(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCalls]);


  const renderItem = ({item}) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.9}>
      <View style={styles.row}>
        <View style={styles.reviewImageView}>
          <FastImage
            source={{uri: item.profileImage || 'https://via.placeholder.com/50'}}
            style={styles.avatar}
            defaultSource={require('../../assets/images/Avatar.jpg')}
          />
          <StarRating rating={item.rating} totalReviews={item.totalReviews} size={14} style={styles.starsContainer} />
        </View>

        <View style={styles.details}>
          <Text style={styles.name} numberOfLines={1}>
            {`${item.name || ''} ${item.lastName || ''}`.trim() || 'Astrologer'}
          </Text>
          
          <Text style={styles.specialization} numberOfLines={1}>
            <MaterialIcons name="email" size={moderateScale(12)} color={COLORS.AstroMaroon} /> {item.email || 'N/A'}
          </Text>

          <View style={styles.priceRow}>
            <Text style={styles.offer}>
              ₹{item.pricing || '0'}/Min
            </Text>
          </View>
        </View>
        
        <TouchableOpacity
          style={item.isCallEnabled ? styles.actionBtn : styles.actionBtnUnavailable}
          activeOpacity={0.8}
          onPress={() => {
            if (item.isCallEnabled) {
              getRoomTokenWebCall(item);
            } else {
              Alert.alert('Unavailable', `${item.name || 'This astrologer'} is not available for calls right now.`);
            }
          }}>
          <MaterialIcons name={item.isCallEnabled ? 'call' : 'phone-disabled'} size={moderateScale(20)} color="#fff" style={{marginRight: 4}} />
          <Text style={styles.actionBtnText}>{item.isCallEnabled ? 'Call' : 'Unavailable'}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.red} />
          <Text>Loading...</Text>
        </View>
      );
    }

    if (filteredCalls.length === 0) {
      return (
        <View style={styles.noCallsContainer}>
          <Text style={styles.noCallsText}>No calls found</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={filteredCalls}
        renderItem={renderItem}
        keyExtractor={item => item._id}
        contentContainerStyle={styles.listContainer}
      />
    );
  };

  return (
    <View style={styles.container}>
      <ReusableList
        data={calls}
        buttonType="call"
        actionButton={getRoomTokenWebCall}
        handleAstrologer={(item) => navigation.navigate('AstrologerInfo', { person: item })}
      />
      <Modal transparent={true} visible={isWaiting} animationType="fade" onRequestClose={cancelCall}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ 
            width: '85%', 
            backgroundColor: COLORS.AstroMaroon, 
            borderRadius: 15, 
            padding: 25, 
            alignItems: 'center',
            borderWidth: 1,
            borderColor: COLORS.AstroSoftOrange
          }}>
            <ActivityIndicator size="large" color={COLORS.AstroGold} />
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.AstroGold, marginTop: 20, marginBottom: 10 }}>Request Sent</Text>
            <Text style={{ fontSize: 16, color: COLORS.AstroSoftOrange, textAlign: 'center', marginBottom: 25, lineHeight: 22 }}>
              Waiting for {waitingAstroName} to accept your request...
            </Text>
            <TouchableOpacity 
              style={{ 
                backgroundColor: COLORS.AstroSoftOrange, 
                paddingHorizontal: 30, 
                paddingVertical: 12, 
                borderRadius: 25,
                width: '100%',
                alignItems: 'center'
              }}
              onPress={cancelCall}
            >
              <Text style={{ color: COLORS.AstroMaroon, fontWeight: 'bold', fontSize: 16 }}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  listContainer: {
    paddingVertical: verticalScale(10),
    paddingBottom: verticalScale(85),
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: scale(10),
    marginBottom: 0,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(12),
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
  },
  searchInput: {
    flex: 1,
    height: verticalScale(45),
    marginLeft: scale(10),
    color: 'black',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(14),
  },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(10),
  },
  avatar: {
    width: scale(50),
    height: scale(50),
    borderRadius: scale(25),
    marginRight: scale(15),
  },
  callInfo: {
    flex: 1,
  },
  name: {
    fontSize: moderateScale(16),
    fontWeight: '600',
    color: '#000000',
    marginBottom: verticalScale(2),
  },
  starsContainer: {
    flexDirection: 'row',
    marginTop: verticalScale(4),
  },
  star: {
    marginRight: scale(1),
  },
  ratingText: {
    fontSize: moderateScale(14),
    color: '#8E8E93',
    marginLeft: scale(4),
  },
  callTypeIcon: {
    marginLeft: scale(10),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noCallsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noCallsText: {
    fontSize: moderateScale(16),
    color: '#8E8E93',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(16),
    padding: scale(15),
    marginBottom: verticalScale(15),
    elevation: 5,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(244, 216, 188, 0.5)',
    marginHorizontal: scale(15),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewImageView: {
    alignItems: 'center',
    width: scale(85),
    marginRight: scale(5),
  },
  details: {
    flex: 1,
    marginLeft: scale(5),
    justifyContent: 'center',
  },
  specialization: {
    fontSize: moderateScale(13),
    marginBottom: verticalScale(4),
    color: '#424242',
    fontFamily: 'Lato-Regular',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offer: {
    fontSize: moderateScale(14),
    color: COLORS.green,
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
  },
  actionBtn: {
    backgroundColor: COLORS.green,
    borderRadius: moderateScale(25),
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  actionBtnText: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14),
    fontWeight: 'bold',
  },
  // Red "unavailable" Call button — astrologer stays listed, button signals calls are off
  actionBtnUnavailable: {
    backgroundColor: '#C0392B',
    borderRadius: moderateScale(25),
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
    elevation: 3,
  },
});

export default CallsList;
