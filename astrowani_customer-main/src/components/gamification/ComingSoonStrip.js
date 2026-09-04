// The discovery strip on Home: "Coming soon to Astrowani".
//
// This is the ONLY gamification surface on Home, and it is deliberately not a mechanic.
// Earlier these were dropped onto Home as working widgets, which reads as "these are live,
// use them" — and they are not: the rewards are undecided and there is no backend behind
// three of them. A customer who spins a wheel and wins something unredeemable is worse off
// than one who never saw it.
//
// So Home gets a row of cards that INTRODUCE the features. Each opens that feature's own
// screen, where the demo lives behind a "coming soon" banner.
//
// It renders nothing at all when the catalogue is empty, so the last feature going live
// removes this strip from Home without anyone having to remember to delete it.

import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {FEATURES} from './gamificationFeatures';
import {GAME} from './gamificationTheme';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';

export default function ComingSoonStrip({navigation, onEvent}) {
  if (!FEATURES.length) return null;

  const open = id => {
    onEvent && onEvent(id);
    navigation.navigate('FeatureIntro', {id});
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View>
          <Text style={styles.kicker}>Coming soon</Text>
          <Text style={styles.title}>What we're building</Text>
        </View>
        <TouchableOpacity
          style={styles.allBtn}
          activeOpacity={0.85}
          onPress={() => {
            onEvent && onEvent('see_all');
            navigation.navigate('GamificationHub');
          }}>
          <Text style={styles.allTxt}>See all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {FEATURES.map(f => (
          <TouchableOpacity
            key={f.id}
            activeOpacity={0.85}
            style={styles.card}
            onPress={() => open(f.id)}>
            <View style={styles.icon}>
              <MaterialIcons
                name={f.icon}
                size={moderateScale(22)}
                color={GAME.brand}
              />
            </View>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {f.title}
            </Text>
            <Text style={styles.cardTag} numberOfLines={3}>
              {f.tagline}
            </Text>
            <View style={styles.peek}>
              <Text style={styles.peekTxt}>Take a look</Text>
              <MaterialIcons
                name="arrow-forward"
                size={moderateScale(12)}
                color={GAME.brand}
              />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {marginTop: verticalScale(6)},
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: scale(15),
    marginBottom: verticalScale(10),
  },
  kicker: {
    fontSize: moderateScale(9.5),
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: GAME.gold,
    fontWeight: '700',
  },
  title: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    color: GAME.text,
    marginTop: verticalScale(2),
  },
  allBtn: {
    paddingVertical: verticalScale(5),
    paddingHorizontal: scale(12),
    borderRadius: moderateScale(14),
    borderWidth: 1,
    borderColor: GAME.brand,
  },
  allTxt: {fontSize: moderateScale(11), fontWeight: '700', color: GAME.brand},

  row: {paddingHorizontal: scale(15), gap: scale(10)},
  card: {
    width: scale(140),
    backgroundColor: GAME.card,
    borderRadius: moderateScale(13),
    borderWidth: 1,
    borderColor: GAME.border,
    padding: moderateScale(12),
  },
  icon: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: GAME.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(9),
  },
  cardTitle: {fontSize: moderateScale(13), fontWeight: '700', color: GAME.text},
  cardTag: {
    fontSize: moderateScale(10.5),
    lineHeight: moderateScale(15),
    color: GAME.textSoft,
    marginTop: verticalScale(3),
    minHeight: verticalScale(45),
  },
  peek: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(4),
    marginTop: verticalScale(6),
  },
  peekTxt: {fontSize: moderateScale(10.5), fontWeight: '700', color: GAME.brand},
});
