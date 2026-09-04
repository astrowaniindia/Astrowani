// "What's coming to Astrowani" — the browsable list of features being built.
//
// Reached from the drawer, and from the "See all" on Home's discovery strip. It is a tour,
// not a dashboard: nothing here is operable, every row opens that feature's own screen.
//
// The list comes from components/gamification/gamificationFeatures.js. When a feature ships
// for real it leaves that catalogue and this screen shrinks by one row on its own.

import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {FEATURES} from '../../components/gamification/gamificationFeatures';
import {GAME} from '../../components/gamification/gamificationTheme';
import {moderateScale, verticalScale} from '../../utils/Scaling';

export default function GamificationHub({navigation}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        A few things we are building for Astrowani. Have a look at each one — you can try
        them, though nothing is live yet.
      </Text>

      {FEATURES.map(f => (
        <TouchableOpacity
          key={f.id}
          activeOpacity={0.85}
          style={styles.row}
          onPress={() => navigation.navigate('FeatureIntro', {id: f.id})}>
          <View style={styles.icon}>
            <MaterialIcons name={f.icon} size={moderateScale(21)} color={GAME.brand} />
          </View>
          <View style={styles.rowText}>
            <View style={styles.titleLine}>
              <Text style={styles.title}>{f.title}</Text>
              <View style={styles.pill}>
                <Text style={styles.pillTxt}>SOON</Text>
              </View>
            </View>
            <Text style={styles.tagline} numberOfLines={2}>
              {f.tagline}
            </Text>
          </View>
          <MaterialIcons
            name="chevron-right"
            size={moderateScale(20)}
            color={GAME.dim}
          />
        </TouchableOpacity>
      ))}

      <Text style={styles.foot}>
        Nothing here awards anything yet. We will tell you when each one goes live.
      </Text>
      <View style={{height: verticalScale(30)}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: GAME.screenBg},
  content: {padding: moderateScale(16)},
  intro: {
    fontSize: moderateScale(13),
    lineHeight: moderateScale(20),
    color: GAME.textSoft,
    marginBottom: verticalScale(16),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(12),
    backgroundColor: GAME.card,
    borderRadius: moderateScale(13),
    borderWidth: 1,
    borderColor: GAME.border,
    padding: moderateScale(13),
    marginBottom: verticalScale(10),
  },
  icon: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(21),
    backgroundColor: GAME.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {flex: 1},
  titleLine: {flexDirection: 'row', alignItems: 'center', gap: moderateScale(7)},
  title: {fontSize: moderateScale(14.5), fontWeight: '700', color: GAME.text},
  pill: {
    backgroundColor: GAME.goldFaint,
    borderWidth: 1,
    borderColor: GAME.gold,
    borderRadius: moderateScale(4),
    paddingHorizontal: moderateScale(5),
    paddingVertical: verticalScale(1),
  },
  pillTxt: {
    fontSize: moderateScale(8),
    letterSpacing: 0.8,
    fontWeight: '700',
    color: '#7A5A1E',
  },
  tagline: {
    fontSize: moderateScale(11.5),
    color: GAME.textSoft,
    marginTop: verticalScale(2),
    lineHeight: moderateScale(16),
  },
  foot: {
    fontSize: moderateScale(11),
    color: GAME.textMuted,
    textAlign: 'center',
    marginTop: verticalScale(10),
    fontStyle: 'italic',
  },
});
