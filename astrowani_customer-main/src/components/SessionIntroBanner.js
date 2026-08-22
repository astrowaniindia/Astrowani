// The "share your birth details first" prompt, shown once at the top of a session.
//
// PURELY PRESENTATIONAL — it changes nothing about billing. The session is charged from
// the moment it connects exactly as before; this only tells the customer what to do with
// the opening moments so the consult doesn't start with the astrologer asking for a
// birth date. Wording is admin-editable (app_settings.session_intro_banner_text), and the
// whole thing can be switched off from the admin without an app release.
//
// Dismissible and self-hiding: it auto-collapses after DISMISS_AFTER_MS so it never sits
// on top of a live chat, and tapping X removes it immediately. It is NOT persisted as
// "seen forever" — the reminder is useful at the start of every session, not just the
// first, since the details matter per-reading.
import React, { useContext, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import useSessionIntroBanner from '../hooks/useSessionIntroBanner';
import { LanguageContext } from '../context/LanguageContext';

const DISMISS_AFTER_MS = 25000;

const SessionIntroBanner = ({ visible = true, style }) => {
  const { language } = useContext(LanguageContext);
  const { enabled, text } = useSessionIntroBanner(language);
  const [dismissed, setDismissed] = useState(false);
  const [fade] = useState(new Animated.Value(0));

  const shown = visible && enabled && !!text && !dismissed;

  useEffect(() => {
    if (!shown) return undefined;
    Animated.timing(fade, {
      toValue: 1, duration: 260, easing: Easing.out(Easing.ease), useNativeDriver: true,
    }).start();
    const t = setTimeout(() => setDismissed(true), DISMISS_AFTER_MS);
    return () => clearTimeout(t);
  }, [shown, fade]);

  if (!shown) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity: fade }, style]}>
      <MaterialIcons name="lightbulb-outline" size={moderateScale(17)} color={COLORS.AstroGold} />
      <Text style={styles.text}>{text}</Text>
      <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={10} style={styles.close}>
        <MaterialIcons name="close" size={moderateScale(15)} color="rgba(255,255,255,0.7)" />
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
  close: { paddingLeft: scale(2), paddingTop: verticalScale(1) },
});

export default SessionIntroBanner;
