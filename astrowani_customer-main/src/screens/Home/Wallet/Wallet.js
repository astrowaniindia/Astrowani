import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
const plans = [
  {id: '1', amount: 50},
  {id: '2', amount: 100},
  {id: '3', amount: 150},
  {id: '4', amount: 200},
  {id: '5', amount: 250},
  {id: '6', amount: 300},
  {id: '7', amount: 500},
  {id: '8', amount: 1000},
  {id: '9', amount: 2000},
];
const Wallet = ({navigation}) => {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const handleSubmit = () => {
    if (!selectedPlan) {
      Alert.alert('Please select a plan first.');
      return;
    }
    const options = {
      description: 'Wallet Recharge',
      image: 'https://your-logo-url.com/logo.png',
      currency: 'INR',
      key: 'rzp_live_3PXDqZGmI6Zz4o', 
      amount: selectedPlan.amount * 100,
      name: 'Astrowani',
      prefill: {
        email: 'test@example.com',
        contact: '+919829304067',
        name: 'User',
      },
      theme: {color: '#F37254'},
    };
    RazorpayCheckout.open(options)
      .then(data => {
        // Success
        Alert.alert('Payment Successful', `Payment ID: ${data.razorpay_payment_id}`);
        // Optionally, call an API to update wallet balance
      })
      .catch(error => {
        // Failure
        Alert.alert('Payment Failed', error.description);
      });
  };

  const renderPlan = ({item}) => (
    <TouchableOpacity
      style={[
        styles.planContainer,
        selectedPlan?.id === item.id && styles.selectedPlan,
      ]}
      onPress={() => setSelectedPlan(item)}>
      <Text style={styles.planText}>₹ {item.amount}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Tap on a plan to recharge</Text>
      <FlatList
        data={plans}
        renderItem={renderPlan}
        keyExtractor={item => item.id}
        numColumns={3}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.contentContainer}
      />
      {selectedPlan && (
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitTxt}>Submit & Pay ₹{selectedPlan.amount}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default Wallet;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: scale(16),
  },
  heading: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: 'black',
    marginBottom: verticalScale(16),
  },
  planContainer: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    margin: scale(5),
    padding: scale(20),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedPlan: {
    backgroundColor: '#B71C1C',
  },
  planText: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: '#000',
  },
  row: {
    justifyContent: 'space-between',
  },
  contentContainer: {
    paddingBottom: verticalScale(16),
  },
  submitBtn: {
    backgroundColor: '#B71C1C',
    padding: scale(14),
    borderRadius: scale(8),
    alignItems: 'center',
    marginTop: verticalScale(20),
  },
  submitTxt: {
    color: '#fff',
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
  },
});
