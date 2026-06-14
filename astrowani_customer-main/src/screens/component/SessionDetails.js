import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import {scale, verticalScale, moderateScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import FontAwesome from 'react-native-vector-icons/FontAwesome';

const SessionDetails = ({session, handleprofile}) => {
  const [isModalVisible, setModalVisible] = useState(false);
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.referenceText}>
          Reference ID: {session.referenceId}
        </Text>
      </View>
      <View style={styles.details}>
        <View style={styles.imgView}>
          <Image source={{uri: session.image}} style={styles.image} />
          <TouchableOpacity
            onPress={() => handleprofile(session)}
            style={styles.profileButton}>
            <Text style={styles.profileButtonText}>View Profile</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{session.name}</Text>
          <Text style={styles.chatType}>{session.chatType}</Text>
          <Text style={styles.time}>{session.time}</Text>
          <Text style={styles.rate}>Astrologer Rate: ₹{session.rate}/min</Text>
          <Text style={styles.duration}>Duration: {session.duration} min</Text>
          <Text style={styles.deduction}>Deduction: ₹{session.deduction}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.rating}
        onPress={() => setModalVisible(true)}>
        <Text style={styles.ratingText}>Rate us: ⭐⭐⭐⭐⭐</Text>
        {/* Add stars rating component here */}
      </TouchableOpacity>
      <RateUsModal
        visible={isModalVisible}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.AstroSoftOrange,
    borderRadius: moderateScale(8),
    padding: moderateScale(10),
    marginVertical: verticalScale(10),
    marginHorizontal: scale(15),
    shadowColor: '#000',
    shadowOffset: {width: 0, height: verticalScale(2)},
    shadowOpacity: 0.2,
    shadowRadius: moderateScale(4),
    elevation: moderateScale(2),
  },
  header: {
    borderBottomWidth: verticalScale(0.5),
    borderBottomColor: COLORS.AstroMaroon,
    paddingBottom: verticalScale(5),
    alignItems: 'center',
  },
  referenceText: {
    fontSize: moderateScale(12),
    color: '#000',
    fontWeight: 'bold',
  },
  details: {
    flexDirection: 'row',
    marginTop: verticalScale(10),
  },
  image: {
    width: scale(55),
    height: verticalScale(55),
    borderRadius: moderateScale(30),
  },
  info: {
    flex: 1,
    marginLeft: scale(20),
  },
  name: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: '#000',
  },
  chatType: {
    fontSize: moderateScale(14),
    color: 'red',
    fontWeight: 'bold',
    marginVertical: verticalScale(2),
  },
  time: {
    fontSize: moderateScale(12),
    color: '#000',
    fontWeight: 'bold',
    marginBottom: verticalScale(10),
  },
  rate: {
    fontSize: moderateScale(12),
    color: '#000',
    fontWeight: 'bold',
    marginBottom: verticalScale(1),
  },
  duration: {
    fontSize: moderateScale(12),
    color: '#000',
    fontWeight: 'bold',
    marginBottom: verticalScale(1),
  },
  deduction: {
    fontSize: moderateScale(12),
    color: '#000',
    fontWeight: 'bold',
    marginBottom: verticalScale(1),
  },
  profileButton: {
    marginTop: verticalScale(10),
    backgroundColor: '#e6f2e6',
    borderRadius: moderateScale(15),
    paddingVertical: verticalScale(3),
    paddingHorizontal: scale(10),
  },
  profileButtonText: {
    color: 'green',
    fontSize: moderateScale(11),
    fontWeight: 'bold',
  },
  footer: {
    marginTop: verticalScale(10),
  },
  chatDetails: {
    color: '#c0392b',
    fontSize: moderateScale(14),
    fontWeight: 'bold',
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(20),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(15),
    paddingVertical: verticalScale(4),
  },
  ratingText: {
    color: '#fff',
    alignSelf: 'center',
    fontWeight: 'bold',
    fontSize: moderateScale(13),
  },
  imgView: {
    alignItems: 'center',
  },

  //modal

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: moderateScale(10),
    padding: scale(20),
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: verticalScale(10),
    right: scale(10),
  },
  profileImage: {
    width: scale(70),
    height: scale(70),
    borderRadius: moderateScale(35),
    marginTop: verticalScale(-55),
  },
  title: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    marginTop: verticalScale(10),
    color: '#000',
  },
  subtitle: {
    fontSize: moderateScale(15),
    marginTop: verticalScale(5),
    textAlign: 'center',
    color: '#000',
    fontWeight: 'bold',
  },
  description: {
    fontSize: moderateScale(13),
    color: '#000',
    textAlign: 'center',
    marginVertical: verticalScale(10),
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: scale(20),
  },
  submitButton: {
    backgroundColor: '#FFD700',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(30),
    borderRadius: moderateScale(5),
  },
  submitButtonText: {
    color: 'black',
    fontSize: moderateScale(13),
    fontWeight: 'bold',
  },
  starpress: {
    marginRight: scale(5),
  },
});

export default SessionDetails;

const RateUsModal = ({visible, onClose}) => {
  const [rating, setRating] = useState(0);

  return (
    <Modal visible={visible} transparent={true} animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <FontAwesome name="times-circle" size={24} color="black" />
          </TouchableOpacity>
          <Image
            source={{
              uri: 'https://th.bing.com/th/id/OIP.6VsfIq35PtqvwJQQHsHqgAHaF6?w=229&h=183&c=7&r=0&o=5&pid=1.7',
            }} // Replace with your image URL
            style={styles.profileImage}
          />
          <Text style={styles.title}>Meenakshik</Text>
          <Text style={styles.subtitle}>How was your Session?</Text>
          <Text style={styles.description}>
            Please take a moment to give us your feedback so we can ensure you
            get the best experience.
          </Text>

          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map(star => (
              <TouchableOpacity
                style={styles.starpress}
                key={star}
                onPress={() => setRating(star)}>
                <FontAwesome
                  name={star <= rating ? 'star' : 'star-o'}
                  size={30}
                  color={star <= rating ? '#FFD700' : '#C0C0C0'}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={onClose}>
            <Text style={styles.submitButtonText}>Submit Review</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
