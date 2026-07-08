import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Linking} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function PdfReportResultScreen({route}) {
  const {data} = route.params || {};

  return (
    <View style={styles.main}>
      <View style={styles.card}>
        <Ionicons name="document-text" size={60} color={COLORS.AstroMaroon} />
        <Text style={styles.title}>Your report is ready</Text>
        <Text style={styles.subtitle}>Tap below to view or download your PDF report.</Text>
        <TouchableOpacity
          style={styles.button}
          disabled={!data?.pdfUrl}
          onPress={() => data?.pdfUrl && Linking.openURL(data.pdfUrl)}>
          <Text style={styles.buttonText}>View Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange, justifyContent: 'center'},
  card: {
    backgroundColor: COLORS.white, borderRadius: moderateScale(12), marginHorizontal: scale(15),
    padding: scale(24), alignItems: 'center',
  },
  title: {fontSize: moderateScale(16), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginTop: verticalScale(12)},
  subtitle: {fontSize: moderateScale(12), fontFamily: 'Lato-Regular', color: COLORS.lightGrey, textAlign: 'center', marginTop: verticalScale(6), marginBottom: verticalScale(16)},
  button: {
    height: verticalScale(46), minWidth: scale(180), justifyContent: 'center', alignItems: 'center',
    borderRadius: moderateScale(8), backgroundColor: COLORS.AstroGold, paddingHorizontal: scale(16),
  },
  buttonText: {color: COLORS.black, fontSize: moderateScale(14), fontFamily: 'Lato-Bold'},
});
