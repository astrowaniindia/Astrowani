import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../api/SupabaseClient';

const ReusableList = ({data, actionButton, handleAstrologer, buttonType, refreshing, onRefresh}) => {
  const navigation = useNavigation();
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingAstroName, setWaitingAstroName] = useState('');

  const getRoomTokenWebCall = async (item) => {
    try {
      const token = await AsyncStorage.getItem('token');
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
      
      try {
        // 1. Generate the call room FIRST
        const callResponse = await axios.post(
          `http://10.0.2.2:4500/api/call/initiate`,
          {
            receiverId: item.userId,
            callType: "voice",
            callerRole: "customer",
            name: item.name
          },
          { headers: {Authorization: `Bearer ${token}`} }
        );
        
        if (callResponse.status !== 200) {
          setIsWaiting(false);
          Alert.alert('Error', 'Failed to generate call room.');
          return null;
        }

        const roomTokenData = callResponse.data.data?.token?.token || callResponse.data.token?.token || callResponse.data.token;
        const roomId = callResponse.data.data?.roomId || callResponse.data.roomId;

        // 2. Create the call request with the token
        const { data: requestData, error: requestError } = await supabase
          .from('call_requests')
          .insert([{
            customer_id: userEntireData.id,
            astrologer_id: item.userId,
            customer_name: userEntireData.name || 'Customer',
            call_type: 'video', // or 'audio' based on buttonType
            status: 'pending',
            room_id: roomId,
            room_token: roomTokenData
          }])
          .select()
          .single();
          
        if (requestError) {
          setIsWaiting(false);
          Alert.alert('Error', 'Failed to send request to astrologer.');
          return null;
        }
        
        // 3. Subscribe to realtime updates for this specific request
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
          
      } catch (err) {
        setIsWaiting(false);
        console.log(err?.response || err);
        Alert.alert('Error', 'Failed to initiate call');
      }
        
    } catch (error) {
      setIsWaiting(false);
      console.log(error?.response);
      console.log(error.response?.data, "*************");
      console.log("here call breaks....123");
      Alert.alert('Error', 'Failed to initiate call');
      return null;
    }
  };
  
  const handleCall = async (item) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const userEntireData = JSON.parse(await AsyncStorage.getItem('userData'));

      navigation.navigate('EnxJoinScreen', {
        userId: item.userId,
        name: userEntireData?.name || 'User',
        astroId: item.userId,
        callType: 'voice',
        receiverId: item.userId,
        callingCondition: 'outgoing',
        callerRole: 'customer',
        userToken: token,
      });
    } catch (error) {
      console.log('Error initiating call:', error);
      Alert.alert('Error', 'Failed to initiate call');
    }
  };

  const renderButton = (item) => {
    switch (buttonType) {
      case 'video':
        return (
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => {getRoomTokenWebCall(item)}}
          >
            <Text style={styles.chatText}>Video</Text>
          </TouchableOpacity>
        );
      case 'call':
        return (
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => getRoomTokenWebCall(item)}
          >
            <Text style={styles.chatText}>Call</Text>
          </TouchableOpacity>
        );
      case 'view profile':
        return (
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => actionButton(item)}
          >
            <Text style={styles.chatText}>View Profile</Text>
          </TouchableOpacity>
        );
      case 'chat':
      default:
        return (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.chatButton, styles.smallButton]}
              onPress={() => actionButton(item)}
            >
              <Text style={styles.chatText}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.callButton, styles.smallButton]}
              onPress={() => handleCall(item)}
            >
              <Text style={styles.callText}>Call</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  const renderItem = ({item}) => {
    const languages = item.language?.join(', ');

    return (
      <TouchableOpacity
        onPress={() => handleAstrologer && handleAstrologer(item)}
        style={styles.card}
      >
        {item.badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        )}
        <View style={styles.row}>
          <View style={styles.reviewImageView}>
            <Image
              source={{
                uri: item.profileImage || 'https://th.bing.com/th/id/OIP.xHU435DrZMf0aN-ri48zEAHaJQ?w=126&h=180&c=7&r=0&o=5&pid=1.7',
              }}
              style={styles.avatar}
            />

            <View style={styles.starsContainer}>
              {Array.from({length: item?.rating || 0}).map((_, index) => (
                <MaterialIcons
                  key={index}
                  name="star"
                  size={moderateScale(14)}
                  color="orange"
                  style={styles.star}
                />
              ))}
            </View>
          </View>
          <View style={styles.details}>
            <Text style={styles.name}>{item.name || 'name'}</Text>

            <Text style={styles.specialization}>
              {item.specialties?.[0]?.name || 'Vedic Astrology'}
            </Text>

            <Text style={styles.languages}>{languages || 'Hindi'}</Text>

            <Text style={styles.experience}>Exp: {item.experience ?? '0'}</Text>

            <View style={styles.priceRow}>
              <Text style={styles.offer}>
                {item.pricing ? `₹${item.pricing}/min` : 'Free'}
              </Text>
            </View>
          </View>

          {renderButton(item)}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data}
        keyExtractor={item => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.container}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
      {/* Waiting Modal */}
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

export default ReusableList;

const styles = StyleSheet.create({
  container: {
    padding: scale(10),
    paddingBottom: verticalScale(85),
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
    top: verticalScale(0),
    right: scale(0),
    backgroundColor: 'red',
    paddingHorizontal: scale(5),
    paddingVertical: verticalScale(4),
    borderTopRightRadius: moderateScale(10),
    borderBottomLeftRadius: moderateScale(10),
  },
  badgeText: {
    color: '#fff',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(10),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: scale(60),
    height: verticalScale(60),
    borderRadius: moderateScale(30),
  },
  details: {
    flex: 1,
  },
  name: {
    fontSize: moderateScale(17),
    color: 'black',
    marginBottom: verticalScale(3),
    fontFamily: 'Lato-Bold',
  },
  specialization: {
    fontSize: moderateScale(14),
    marginBottom: verticalScale(5),
    color: '#666',
    fontFamily: 'Lato-Regular',
  },
  languages: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: '#666',
    marginBottom: verticalScale(5),
  },
  experience: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: '#666',
    marginBottom: verticalScale(5),
  },
  priceRow: {
    flexDirection: 'row',
  },
  price: {
    textDecorationLine: 'line-through',
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: '#666',
  },
  offer: {
    fontSize: moderateScale(13),
    color: 'red',
    fontFamily: 'Lato-Regular',
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallButton: {
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(15),
    marginHorizontal: scale(2),
  },
  chatButton: {
    backgroundColor: '#00C853',
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(5),
  },
  callButton: {
    backgroundColor: COLORS.green,
  },
  chatText: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
  },
  callText: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
  },
  reviewImageView: {
    alignItems: 'center',
    width: scale(75),
    marginRight: scale(10),
  },
  rating: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(11),
  },
  starsContainer: {
    flexDirection: 'row',
    marginTop: verticalScale(4),
  },
  star: {
    marginRight: scale(1),
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(10),
    padding: moderateScale(20),
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    color: '#333',
    marginTop: verticalScale(15),
    marginBottom: verticalScale(10),
  },
  modalText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#666',
    textAlign: 'center',
    marginBottom: verticalScale(20),
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
  },
  cancelButtonText: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14),
  },
});


