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

import React, {useState, useEffect} from 'react';
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
import axios from 'axios';
import {COLORS} from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import { supabase } from '../../api/SupabaseClient';

const CallsList = ({navigation}) => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filteredCalls, setFilteredCalls] = useState([]);
  const [showMissedOnly, setShowMissedOnly] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchCalls();
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
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingAstroName, setWaitingAstroName] = useState('');

  const getRoomTokenWebCall = async (item) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const userToken = await AsyncStorage.getItem('userToken');
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr) {
        Alert.alert('Error', 'Please login to continue.');
        return null;
      }
      const userEntireData = JSON.parse(userDataStr);
      
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('id', userEntireData.id)
        .single();
        
      if (customerError) {
        console.error('Wallet Error:', customerError);
        Alert.alert('Error', 'Failed to verify wallet balance.');
        return null;
      }
      
      const pricePerMin = item.videoPrice || item.chargePerMinute || 40;
      const minRequired = pricePerMin * 5; // Require at least 5 mins balance
      
      if (customer.wallet_balance < minRequired) {
        Alert.alert('Insufficient Balance', `You need at least ₹${minRequired} to connect. Current balance: ₹${customer.wallet_balance}. Please recharge.`);
        return null;
      }
      
      setIsWaiting(true);
      setWaitingAstroName(item.name);
      
      const response = await axios.post(
        `http://10.0.2.2:4500/api/call/initiate`,
        {
          receiverId: item.userId,
          callType: 'video',
          callerRole: 'customer',
          name: item.name,
        },
        {
          headers: {Authorization: `Bearer ${token}`},
        }
      );

      if (response.status === 200) {
        const roomTokenData = response.data.data?.token?.token || response.data.token?.token || response.data.token;
        const roomIdData = response.data.data?.roomId || response.data.roomId;
        
        const { data: requestData, error: requestError } = await supabase
          .from('call_requests')
          .insert([{
            customer_id: userEntireData.id,
            astrologer_id: item.userId,
            customer_name: userEntireData.name || 'Customer',
            call_type: 'video',
            status: 'pending',
            room_id: roomIdData,
            room_token: roomTokenData
          }])
          .select()
          .single();

        if (requestError) {
          setIsWaiting(false);
          Alert.alert('Error', 'Failed to send request to astrologer.');
          return null;
        }

        const channel = supabase.channel(`call_request_${requestData.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'call_requests', filter: `id=eq.${requestData.id}` },
            async (payload) => {
              if (payload.new.status === 'accepted') {
                supabase.removeChannel(channel);
                setIsWaiting(false);
                navigation.navigate("EnxConferenceScreen", { token: roomTokenData });
              } else if (payload.new.status === 'rejected') {
                supabase.removeChannel(channel);
                setIsWaiting(false);
                Alert.alert('Declined', `${item.name} is currently busy and declined the call.`);
              }
            }
          )
          .subscribe();

        return response.data.token;
      } else {
        setIsWaiting(false);
        Alert.alert('Error', response.data.error || 'Unexpected Error');
        return null;
      }
    } catch (error) {
      setIsWaiting(false);
      Alert.alert('Error', 'Failed to initiate call');
      return null;
    }
  };
  const fetchCalls = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      const response = await Instance.get('/api/astrologers/liveAstrologers');
      console.log(response?.data.data, '$$$$$$$$$$$$');
      if (response?.data.data) {
        setCalls(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAudioCall = () => {
    // navigation.navigate('JoinRoom');
  };

  const renderCallTypeIcon = (isVideoCall, item) => {
    const iconName = isVideoCall ? 'videocam' : 'call';
    return (
      <TouchableOpacity
        onPress={() => {
          getRoomTokenWebCall(item);
        }}>
        <MaterialIcons
          name={iconName}
          size={moderateScale(24)}
          color="#8E8E93"
          style={styles.callTypeIcon}
        />
      </TouchableOpacity>
    );
  };

  const renderStarRating = rating => {
    return (
      <View style={styles.starsContainer}>
        {Array.from({length: rating || 0}).map((_, index) => (
          <MaterialIcons
            key={index}
            name="star"
            size={moderateScale(14)}
            color={COLORS.AstroGold}
            style={styles.star}
          />
        ))}
      </View>
    );
  };

  const renderItem = ({item}) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.9}>
      <View style={styles.row}>
        <View style={styles.reviewImageView}>
          <FastImage
            source={{uri: item.profileImage || 'https://via.placeholder.com/50'}}
            style={styles.avatar}
            defaultSource={require('../../assets/images/Avatar.jpg')}
          />
          {renderStarRating(item.rating)}
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
          style={styles.actionBtn}
          onPress={() => {
            getRoomTokenWebCall(item);
          }}>
          <MaterialIcons name="call" size={moderateScale(20)} color="#fff" style={{marginRight: 4}} />
          <Text style={styles.actionBtnText}>Call</Text>
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
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={moderateScale(24)} color={COLORS.AstroMaroon} />
        <TextInput 
           style={styles.searchInput}
           placeholder="Search astrologer by name..."
           value={searchQuery}
           onChangeText={setSearchQuery}
           placeholderTextColor={COLORS.AstroMaroon}
        />
      </View>
      {renderContent()}
      <Modal transparent={true} visible={isWaiting} animationType="fade">
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
              onPress={() => setIsWaiting(false)}
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
});

export default CallsList;
