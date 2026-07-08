import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import useAstroPurchase from './useAstroPurchase';
import ReportResultView from './ReportResultView';

export default function TarotScreen() {
  const [reading, setReading] = useState(null);
  const {service, submitting, submit} = useAstroPurchase('tarot');

  const onDraw = async () => {
    setReading(null);
    const data = await submit({});
    if (data) setReading(data.reading);
  };

  return (
    <ScrollView style={styles.main} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Image
          source={{uri: 'https://cdn-icons-png.flaticon.com/128/2951/2951587.png'}}
          style={styles.icon}
        />
        <Text style={styles.title}>Yes or No Tarot Reading</Text>
        <Text style={styles.subtitle}>Draw a card for a quick answer to your question.</Text>
        <TouchableOpacity style={[styles.button, submitting && styles.disabled]} disabled={submitting} onPress={onDraw}>
          {submitting ? (
            <ActivityIndicator color={COLORS.black} />
          ) : (
            <Text style={styles.buttonText}>Draw a Card{service ? ` — ₹${service.price}` : ''}</Text>
          )}
        </TouchableOpacity>
      </View>
      {reading ? <ReportResultView title="Your Reading" data={reading} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  content: {paddingVertical: verticalScale(15)},
  card: {
    backgroundColor: COLORS.white, borderRadius: moderateScale(12), marginHorizontal: scale(15),
    marginBottom: verticalScale(14), padding: scale(20), alignItems: 'center',
  },
  icon: {width: scale(60), height: scale(60), marginBottom: verticalScale(10)},
  title: {fontSize: moderateScale(16), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginBottom: verticalScale(4)},
  subtitle: {fontSize: moderateScale(12), fontFamily: 'Lato-Regular', color: COLORS.lightGrey, textAlign: 'center', marginBottom: verticalScale(14)},
  button: {
    height: verticalScale(46), minWidth: scale(180), justifyContent: 'center', alignItems: 'center',
    borderRadius: moderateScale(8), backgroundColor: COLORS.AstroGold, paddingHorizontal: scale(16),
  },
  disabled: {opacity: 0.5},
  buttonText: {color: COLORS.black, fontSize: moderateScale(14), fontFamily: 'Lato-Bold'},
});
