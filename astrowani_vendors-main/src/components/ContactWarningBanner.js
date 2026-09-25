// A permanent, thin reminder that contact details must not be shared in chat.
// The server masks phone numbers / emails / UPI ids / links with stars and records the
// attempt for review (astrowani-backend/src/contactLeakDetector.js); this tells people
// up front so it never comes as a surprise.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const ContactWarningBanner = ({ text }) => (
  <View style={styles.wrap}>
    <MaterialIcons name="report-problem" size={15} color="#FFD27A" />
    <Text style={styles.text}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(89,42,25,0.94)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 8,
  },
  text: { flex: 1, color: '#fff', fontSize: 12, lineHeight: 16 },
});

export default ContactWarningBanner;
