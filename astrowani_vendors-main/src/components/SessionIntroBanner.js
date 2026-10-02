// The astrologer's counterpart to the customer app's SessionIntroBanner — the small note
// that sits above the first message when a consultation opens, so the opening moments
// (greeting, reading the customer's details) don't feel like wasted billable time.
//
// PURELY PRESENTATIONAL. It changes nothing about billing: the session is charged exactly
// as before, from the moment it connects.
//
// WORDING IS DELIBERATE, do not "simplify" it to "the first minute is free". Measured in
// the billing code 2026-10-02: sessionManager.activateSession sets
// next_billing_at = now + 60s, and process_session_billing then debits the FULL
// per_minute_charge at that point. So the first minute is charged — just in arrears, one
// minute in. It is genuinely free only when the session ends inside that first minute
// (terminateSession never bills a part-minute). "No charge until the first minute is
// complete" is the strongest claim that is actually true; "the first minute is free"
// would be false for every consultation that lasts longer than a minute, which is all of
// them, and this app has spent enough time cleaning up money statements that were not
// quite true.
//
// Dismissible and self-hiding, same as the customer's: it must never sit on top of a live
// chat. Not persisted as "seen forever" — the reminder is useful at the start of every
// session, not just the first.
import React, {useContext, useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Animated, Easing} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import {LanguageContext} from '../context/LanguageContext';

const DISMISS_AFTER_MS = 25000;

const SessionIntroBanner = ({visible = true, style}) => {
  const {t} = useContext(LanguageContext);
  const [dismissed, setDismissed] = useState(false);
  const [fade] = useState(new Animated.Value(0));

  const shown = visible && !dismissed;

  useEffect(() => {
    if (!shown) return undefined;
    Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => setDismissed(true), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [shown, fade]);

  if (!shown) return null;

  return (
    <Animated.View style={[styles.wrap, {opacity: fade}, style]}>
      <MaterialIcons
        name="lightbulb-outline"
        size={moderateScale(17)}
        color={COLORS.AstroGold}
      />
      <Text style={styles.text}>{t('call.introBanner')}</Text>
      <TouchableOpacity
        onPress={() => setDismissed(true)}
        hitSlop={10}
        style={styles.close}>
        <MaterialIcons
          name="close"
          size={moderateScale(15)}
          color="rgba(255,255,255,0.7)"
        />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scale(8),
    backgroundColor: 'rgba(89,42,25,0.94)',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    marginHorizontal: scale(10),
    marginTop: verticalScale(8),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
  },
  text: {
    flex: 1,
    color: '#F7EFE9',
    fontSize: moderateScale(11.5),
    lineHeight: moderateScale(17),
  },
  close: {paddingLeft: scale(2), paddingTop: verticalScale(1)},
});

export default SessionIntroBanner;
