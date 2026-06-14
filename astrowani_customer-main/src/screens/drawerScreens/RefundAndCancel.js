import {ScrollView, StyleSheet, Text, View} from 'react-native';
import React from 'react';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';

const RefundAndCancel = () => {
  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Refund & Cancellation Policy</Text>
        <View style={styles.textcontainer}>
          <Text style={styles.text}>
            1. All astrology consultations and services booked through the
            Astrowani app are provided after confirmation and payment. Once a
            consultation has been completed, no refund will be issued.
          </Text>
          <Text style={styles.text}>
            2. If you wish to cancel a booking, you must do so at least 2 hours
            before the scheduled consultation time. Cancellations made within
            this period will be eligible for a full refund.
          </Text>
          <Text style={styles.text}>
            3. If the astrologer is unavailable due to unforeseen circumstances
            and the session cannot be rescheduled, you will receive a 100%
            refund.
          </Text>
          <Text style={styles.text}>
            4. In cases of technical issues (such as network failure) "from our appside" that
            prevent the consultation from taking place, the session may be
            rescheduled or refunded based on the situation.
          </Text>
          <Text style={styles.text}>
            5. Refunds, if approved, will be processed within 5–7 business days
            to your original payment method.
          </Text>
          <Text style={styles.text}>
            6. Astrowani reserves the right to modify or update this policy at
            any time without prior notice.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default RefundAndCancel;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
    padding: scale(15),
  },
  heading: {
    color: '#000',
    marginVertical: verticalScale(10),
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
  },
  textcontainer: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(9),
    padding: scale(15),
    elevation: 3,
  },
  text: {
    color: '#000',
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Regular',
    marginBottom: verticalScale(10),
    lineHeight: verticalScale(20),
    textAlign: 'justify',
  },
});
