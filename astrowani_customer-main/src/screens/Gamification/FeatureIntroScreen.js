// One feature's own screen: what it is, how it will work, and a preview you can touch.
//
// GENERIC ON PURPOSE. It renders whatever the catalogue (components/gamification/
// gamificationFeatures.js) points at, so adding or removing a feature needs no change here.
// Route param: { id } — one of the FEATURES ids.
//
// THE COMING-SOON BANNER IS NOT DECORATION. Nothing on this screen awards anything, and a
// customer who spins the wheel and "wins 25% off" must not go looking for a coupon that
// does not exist. The banner sits above the demo, not below it, so it is read first.

import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Instance from '../../api/ApiCall';
import {getFeature} from '../../components/gamification/gamificationFeatures';
import FeatureDemo, {DEMO_USES_REAL_DATA} from '../../components/gamification/FeatureDemo';
import {GAME} from '../../components/gamification/gamificationTheme';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';

export default function FeatureIntroScreen({route, navigation}) {
  const id = route?.params?.id;
  const feature = getFeature(id);

  const [profile, setProfile] = useState(null);
  const [referredCount, setReferredCount] = useState(0);
  const [loading, setLoading] = useState(
    id === 'chart' || id === 'tree', // only these two need a fetch
  );

  useEffect(() => {
    if (id !== 'chart' && id !== 'tree') return undefined;
    let cancelled = false;

    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) return;
        if (id === 'chart') {
          const res = await Instance.get('/api/users/profile', {
            headers: {Authorization: `Bearer ${token}`},
          });
          if (!cancelled && res.data?.data) setProfile(res.data.data);
        } else {
          const res = await Instance.get('/api/customer/referral-info', {
            headers: {Authorization: `Bearer ${token}`},
          });
          if (!cancelled && res.data?.success) {
            setReferredCount(res.data.data.totalReferred || 0);
          }
        }
      } catch (_) {
        // Both degrade honestly: an empty chart and a bare tree are valid states, not errors.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!feature) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTxt}>This feature is no longer listed.</Text>
      </View>
    );
  }

  const realData = !!DEMO_USES_REAL_DATA[feature.id];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialIcons
            name={feature.icon}
            size={moderateScale(26)}
            color={GAME.brand}
          />
        </View>
        <Text style={styles.title}>{feature.title}</Text>
        <Text style={styles.tagline}>{feature.tagline}</Text>
      </View>

      <View style={styles.soonBar}>
        <MaterialIcons
          name="schedule"
          size={moderateScale(15)}
          color={GAME.gold}
        />
        <Text style={styles.soonTxt}>
          Coming soon. You can try it below, but nothing is saved and no reward is given yet.
        </Text>
      </View>

      <Text style={styles.blurb}>{feature.blurb}</Text>

      <View style={styles.demoCard}>
        <Text style={styles.demoLabel}>
          {realData ? 'Preview · your real numbers' : 'Preview · example only'}
        </Text>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={GAME.brand} />
          </View>
        ) : (
          <FeatureDemo
            id={feature.id}
            profile={profile}
            referredCount={referredCount}
          />
        )}
      </View>

      <Text style={styles.sectionHead}>How it will work</Text>
      <View style={styles.howBox}>
        {feature.how.map((line, i) => (
          <View key={i} style={styles.howRow}>
            <View style={styles.bullet} />
            <Text style={styles.howTxt}>{line}</Text>
          </View>
        ))}
      </View>

      {!!feature.note && (
        <View style={styles.noteBox}>
          <MaterialIcons
            name="info-outline"
            size={moderateScale(15)}
            color={GAME.textMuted}
          />
          <Text style={styles.noteTxt}>{feature.note}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        activeOpacity={0.85}>
        <Text style={styles.backTxt}>Back</Text>
      </TouchableOpacity>

      <View style={{height: verticalScale(30)}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: GAME.screenBg},
  content: {padding: moderateScale(16)},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: GAME.screenBg},
  emptyTxt: {color: GAME.textSoft, fontSize: moderateScale(13)},

  hero: {alignItems: 'center', marginBottom: verticalScale(14)},
  heroIcon: {
    width: moderateScale(52),
    height: moderateScale(52),
    borderRadius: moderateScale(26),
    backgroundColor: GAME.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  title: {
    fontSize: moderateScale(21),
    fontWeight: '700',
    color: GAME.text,
    textAlign: 'center',
  },
  tagline: {
    fontSize: moderateScale(12.5),
    color: GAME.textSoft,
    textAlign: 'center',
    marginTop: verticalScale(3),
    paddingHorizontal: moderateScale(16),
  },

  soonBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: moderateScale(8),
    backgroundColor: GAME.goldFaint,
    borderWidth: 1,
    borderColor: GAME.gold,
    borderRadius: moderateScale(10),
    padding: moderateScale(11),
  },
  soonTxt: {
    flex: 1,
    fontSize: moderateScale(11.5),
    lineHeight: moderateScale(16),
    color: '#7A5A1E',
  },

  blurb: {
    fontSize: moderateScale(13.5),
    lineHeight: moderateScale(21),
    color: GAME.textSoft,
    marginTop: verticalScale(14),
  },

  demoCard: {
    backgroundColor: GAME.card,
    borderRadius: moderateScale(14),
    borderWidth: 1,
    borderColor: GAME.border,
    padding: moderateScale(14),
    marginTop: verticalScale(14),
  },
  demoLabel: {
    fontSize: moderateScale(9.5),
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: GAME.textMuted,
    marginBottom: verticalScale(10),
    textAlign: 'center',
  },
  loading: {paddingVertical: verticalScale(40), alignItems: 'center'},

  sectionHead: {
    fontSize: moderateScale(10.5),
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: GAME.textMuted,
    marginTop: verticalScale(22),
    marginBottom: verticalScale(8),
  },
  howBox: {
    backgroundColor: GAME.card,
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: GAME.border,
    padding: moderateScale(14),
    gap: verticalScale(10),
  },
  howRow: {flexDirection: 'row', gap: moderateScale(10), alignItems: 'flex-start'},
  bullet: {
    width: moderateScale(6),
    height: moderateScale(6),
    borderRadius: moderateScale(3),
    backgroundColor: GAME.gold,
    marginTop: verticalScale(6),
  },
  howTxt: {
    flex: 1,
    fontSize: moderateScale(12.5),
    lineHeight: moderateScale(19),
    color: GAME.textSoft,
  },

  noteBox: {
    flexDirection: 'row',
    gap: moderateScale(8),
    alignItems: 'flex-start',
    marginTop: verticalScale(14),
    paddingHorizontal: moderateScale(2),
  },
  noteTxt: {
    flex: 1,
    fontSize: moderateScale(11.5),
    lineHeight: moderateScale(17),
    color: GAME.textMuted,
    fontStyle: 'italic',
  },

  backBtn: {
    marginTop: verticalScale(22),
    alignSelf: 'center',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(30),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    borderColor: GAME.brand,
  },
  backTxt: {color: GAME.brand, fontWeight: '700', fontSize: moderateScale(12.5)},
});
