import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialIcons';

const DetailedChat = () => {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.chatDetailCard}>
        <View style={styles.profileSection}>
          <Image
            source={{
              uri: 'https://cdn-icons-png.flaticon.com/128/2202/2202112.png',
            }}
            style={styles.profileImage}
          />
          <View style={styles.profileText}>
            <Text style={styles.name}>Sandeep</Text>
            <Text style={styles.timestamp}>Today 01:06 PM</Text>
          </View>
        </View>

        <View style={styles.detailSection}>
          <View style={styles.textView}>
            <Text style={styles.detailText}>Chat Start Time: </Text>
            <Text style={styles.valueText}>19-Dec-2022 01:06:23 PM</Text>
          </View>
          <View style={styles.textView}>
            <Text style={styles.detailText}>Chat End Time:</Text>
            <Text style={styles.valueText}>19-Dec-2022 01:17:54 PM</Text>
          </View>
          <View style={styles.textView}>
            <Text style={styles.detailText}>Total Paid Minutes:</Text>
            <Text style={styles.valueText}>11 Min</Text>
          </View>

          <View style={styles.textView}>
            <Text style={styles.detailText}>Per Minute Charges:</Text>
            <Text style={styles.valueText}>₹ 9</Text>
          </View>

          <View style={styles.textView}>
            <Text style={styles.detailText}>Total Charges:</Text>
            <Text style={styles.valueText}>₹ 109</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity style={styles.viewChat}>
        <Text style={styles.viewChatTxt}>View Chat History</Text>
        <Icon name="keyboard-arrow-down" size={20} color="#000" />
        {/* Add the icon here */}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
  },
  chatDetailCard: {
    backgroundColor: '#f5f5f5',

    elevation: 5,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(5),
    paddingHorizontal: scale(15),
    backgroundColor: COLORS.AntiFlash,
  },
  profileImage: {
    width: scale(50),
    height: scale(50),
    borderRadius: moderateScale(25),
    marginRight: scale(15),
  },
  profileText: {
    flexDirection: 'column',
  },
  name: {
    fontWeight: 'bold',
    fontSize: moderateScale(17),
    color: '#000',
  },
  timestamp: {
    color: '#000',
    fontSize: moderateScale(12),
  },
  detailSection: {
    marginHorizontal: scale(15),
    borderTopWidth: verticalScale(1),
    borderTopColor: '#ddd',
    paddingTop: verticalScale(10),
  },
  detailText: {
    fontSize: moderateScale(12),
    marginVertical: verticalScale(5),
    color: '#000',
    fontWeight: 'bold',
    width: scale(150),
  },
  valueText: {
    color: '#000',
    fontSize: moderateScale(12),
    fontWeight: '400',
  },
  textView: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewChat: {
    marginVertical: verticalScale(10),
    backgroundColor: '#f5f5f5',
    paddingVertical: verticalScale(10),
    elevation: verticalScale(5),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
  },
  viewChatTxt: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: moderateScale(12),
  },
});

export default DetailedChat;
