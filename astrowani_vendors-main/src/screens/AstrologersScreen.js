// import {StyleSheet, Text, View, ActivityIndicator} from 'react-native';
// import React, {useEffect, useState} from 'react';
// import ReusableList from '../component/ReusableList';
// import Instance from '../../api/ApiCall';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
// import {COLORS} from '../../Theme/Colors';

// const Call = ({navigation}) => {
//   const [astrologer, setAstrologer] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);

//   useEffect(() => {
//     const fetchAstrologer = async () => {
//       try {
//         const token = await AsyncStorage.getItem('token');
//         if (!token) throw new Error('Token not found');

//         const response = await Instance.get('/api/astrologers', {
//           headers: {Authorization: token},
//         });
//         console.log("api repsonse is coming as", )
//         setAstrologer(response.data.data);
//         console.log('chat');
//       } catch (err) {
//         setError(err.message);
//       } finally {
//         setLoading(false);
//       }
//     };
//     fetchAstrologer();
//   }, []);

//   const handleCall = () => {};
//   const handleAstrologer = item => {
//     navigation.navigate('AstrologerInfo', {
//       person: item,
//     });
//   };

//   if (loading) {
//     return (
//       <View style={styles.indicator}>
//         <ActivityIndicator size="small" color={COLORS.primary} />
//       </View>
//     );
//   }

//   if (error) {
//     return <Text style={styles.errorText}>Error: {error}</Text>;
//   }
//   return (
//     <ReusableList
//       data={astrologer}
//       handleAstrologer={handleAstrologer}
//       actionButton={handleCall}
//       buttonType="call"
//     />
//   );
// };

// export default Call;

// const styles = StyleSheet.create({
//   errorText: {
//     color: 'red',
//     textAlign: 'center',
//     paddingVertical: verticalScale(10),
//   },
//   indicator: {
//     flex: 1,
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginVertical: verticalScale(10),
//   },
// });


// import React, { useState, useEffect } from 'react';
// import { StyleSheet, View, FlatList, Text, TouchableOpacity } from 'react-native';
// import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
// import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
// import FastImage from 'react-native-fast-image';

// const CallsList = ({ navigation }) => {
//   const [calls, setCalls] = useState([]);
//   const [filteredCalls, setFilteredCalls] = useState([]);
//   const [showMissedOnly, setShowMissedOnly] = useState(false);

//   useEffect(() => {
//     // Sample data for calls
//     const sampleCalls = [
//       { id: 1, name: 'Miles T Tone', timestamp: 'Sun 17, 08:15 am', isMissed: false, isVideoCall: false },
//       { id: 2, name: 'Hanson Deck', timestamp: 'Sun 17, 09:45 am', isMissed: true, isVideoCall: true },
//       { id: 3, name: 'Fergus Douchebag', timestamp: 'Sat 16, 07:30 pm', isMissed: false, isVideoCall: false },
//       { id: 4, name: 'Spruce Springclean', timestamp: 'Sat 16, 05:08 pm', isMissed: false, isVideoCall: true },
//       { id: 5, name: 'Jason Response', timestamp: 'Fri 15, 11:10 am', isMissed: false, isVideoCall: false },
//       { id: 6, name: 'Pitt Jenkins', timestamp: 'Fri 15, 09:17 am', isMissed: true, isVideoCall: false },
//       { id: 7, name: 'Russell Sprout', timestamp: 'Thu 14, 08:23 pm', isMissed: true, isVideoCall: true },
//       { id: 8, name: 'Girth Wiedenbauer', timestamp: 'Wed 13, 04:00 pm', isMissed: false, isVideoCall: false },
//     ];
//     setCalls(sampleCalls);
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

//   const renderCallStatusIcon = (isMissed) => {
//     const iconName = isMissed ? 'call-missed' : 'call-received';
//     const iconColor = isMissed ? '#FF3B30' : '#34C759';
//     return (
//       <MaterialIcons
//         name={iconName}
//         size={moderateScale(16)}
//         color={iconColor}
//         style={styles.statusIcon}
//       />
//     );
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
//         source={{ uri: `https://randomuser.me/api/portraits/${item.id % 2 ? 'women' : 'men'}/${item.id}.jpg` }}
//         style={styles.avatar}
//       />
//       <View style={styles.callInfo}>
//         <Text style={styles.name}>{item.name}</Text>
//         <View style={styles.callDetails}>
//           {renderCallStatusIcon(item.isMissed)}
//           <Text style={styles.timestamp}>{item.timestamp}</Text>
//         </View>
//       </View>
//       {renderCallTypeIcon(item.isVideoCall)}
//     </TouchableOpacity>
//   );

//   return (
//     <View style={styles.container}>
//       <View style={styles.filterContainer}>
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
//       </View>
//       <FlatList
//         data={filteredCalls}
//         renderItem={renderItem}
//         keyExtractor={item => item.id.toString()}
//         contentContainerStyle={styles.listContainer}
//       />
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#FFFFFF',
//   },
//   filterContainer: {
//     flexDirection: 'row',
//     justifyContent: 'center',
//     paddingVertical: verticalScale(4),
//     paddingHorizontal: scale(4),
//     backgroundColor: '#FFFFFF',
//     borderRadius: 25,
//     marginHorizontal: scale(15),
//     marginTop: verticalScale(15),
//     shadowColor: "#000",
//     shadowOffset: {
//       width: 0,
//       height: 2,
//     },
//     shadowOpacity: 0.1,
//     shadowRadius: 4,
//     elevation: 5,
//   },
//   filterButton: {
//     paddingHorizontal: scale(20),
//     paddingVertical: verticalScale(8),
//     borderRadius: 20,
//     flex: 1,
//     alignItems: 'center',
//   },
//   activeFilter: {
//     backgroundColor: '#007AFF',
//   },
//   filterText: {
//     fontSize: moderateScale(14),
//     fontWeight: '600',
//     color: '#8E8E93',
//   },
//   activeFilterText: {
//     color: '#FFFFFF',
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
//   statusIcon: {
//     marginRight: scale(8),
//   },
//   timestamp: {
//     fontSize: moderateScale(14),
//     color: '#8E8E93',
//   },
//   callTypeIcon: {
//     marginLeft: scale(10),
//   },
// });

// export default CallsList;



import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, Text, TouchableOpacity, ActivityIndicator } from 'react-native';

import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import FastImage from 'react-native-fast-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { SOCKET_URL } from '../config/api';

const AstrologersListScreen = ({ navigation }) => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filteredCalls, setFilteredCalls] = useState([]);
  const [showMissedOnly, setShowMissedOnly] = useState(false);

  useEffect(() => {
    fetchCalls();
  }, []);

  useEffect(() => {
    filterCalls();
  }, [calls, showMissedOnly]);

  const filterCalls = () => {
    let filtered = calls;
    if (showMissedOnly) {
      filtered = filtered.filter(call => call.isMissed);
    }
    setFilteredCalls(filtered);
  };

  const fetchCalls = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('token');
      console.log('Token:', token);
      const response = await axios.get(`${SOCKET_URL}/api/call/call-history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response?.data?.data) {
        setCalls(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderCallTypeIcon = (isVideoCall) => {
    const iconName = isVideoCall ? 'videocam' : 'call';
    return (
      <TouchableOpacity onPress={() => navigation.navigate('AudioCall')} >
        <MaterialIcons
          name={iconName}
          size={moderateScale(24)}
          color="#8E8E93"
          style={styles.callTypeIcon}
        />
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.callItem}>
      <FastImage
        source={{ uri: item.astrologerId.profileImage || 'https://via.placeholder.com/50' }}
        style={styles.avatar}
      // defaultSource={require('../../assets/images/Avatar.jpg')}
      />
      <View style={styles.callInfo}>
        <Text style={styles.name}>
          {`${item.astrologerId.firstName || ''} ${item.astrologerId.lastName || ''}`.trim() || 'Unknown Astrologer'}
        </Text>
        {renderStarRating(item.rating)}
      </View>
      {renderCallTypeIcon(false)}
    </TouchableOpacity>
  );


  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
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

  const renderStarRating = (rating) => {
    const stars = [];
    const maxStars = 5;
    for (let i = 1; i <= maxStars; i++) {
      stars.push(
        <MaterialIcons
          key={i}
          name={i <= rating ? 'star' : 'star-border'}
          size={moderateScale(16)}
          color={i <= rating ? '#FFD700' : '#C0C0C0'}
          style={styles.starIcon}
        />
      );
    }
    return (
      <View style={styles.ratingContainer}>
        {stars}
        <Text style={styles.ratingText}>({rating || 'N/A'})</Text>
      </View>
    );
  };


  return (
    <View style={styles.container}>
      {/* <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, !showMissedOnly && styles.activeFilter]}
          onPress={() => setShowMissedOnly(false)}
        >
          <Text style={[styles.filterText, !showMissedOnly && styles.activeFilterText]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, showMissedOnly && styles.activeFilter]}
          onPress={() => setShowMissedOnly(true)}
        >
          <Text style={[styles.filterText, showMissedOnly && styles.activeFilterText]}>Missed</Text>
        </TouchableOpacity>
      </View> */}
      {renderContent()}
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
    marginBottom: verticalScale(4),
  },
  callDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timestamp: {
    fontSize: moderateScale(14),
    color: '#8E8E93',
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

  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: verticalScale(4),
    paddingHorizontal: scale(4),
    backgroundColor: '#edede9',
    borderRadius: 12,
    marginHorizontal: scale(15),
    marginTop: verticalScale(15),

  },
  filterButton: {
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(8),
    borderRadius: 20,
    flex: 1,
    alignItems: 'center',

  },
  activeFilter: {
    backgroundColor: '#ffff',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  filterText: {
    fontSize: moderateScale(14),
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeFilterText: {
    color: '#007AFF',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starIcon: {
    marginRight: scale(2),
  },
  ratingText: {
    fontSize: moderateScale(14),
    color: '#8E8E93',
    marginLeft: scale(4),
  },
});

export default AstrologersListScreen;