// Per-person Kundali detail, opened from "View Kundali" on the free matching report.
//
// Was: fourteen "Label — value" rows, then a horizontal strip of four cards that
// REPEATED four of those same rows (Varna, Vasya, Tara, Yoni), each behind an
// identical remote flaticon PNG. So the screen said the same thing twice and the
// only imagery was the same placeholder four times over.
//
// Now: nakshatra and rasi as a hero with their lords, and the eight koots as a
// single chip grid — said once, and the eight koots readable as a set, which is
// what they are.
import React from 'react';
import {ScrollView, StyleSheet, View, Text} from 'react-native';
import {useRoute} from '@react-navigation/native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import {
  ASTRO, ReportShell, SectionCard, ChipGrid, Divider, PLANET_GLYPH, ZODIAC_GLYPH,
} from '../../../components/astro/AstroUI';
import {LanguageContext} from '../../../context/LanguageContext';

const KOOTS = ['varna', 'vasya', 'tara', 'yoni', 'graha_maitri', 'gana', 'bhakoot', 'nadi'];
const label = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function KundaliMatchingDetailsScreen() {
  const {t} = React.useContext(LanguageContext);
  const route = useRoute();
  const {kundaliData, name} = route.params || {};
  const k = kundaliData || {};

  const heroes = [
    {
      label: t('report.nakshatra'),
      value: k?.nakshatra?.name,
      sub: [k?.nakshatra?.lord?.name, k?.nakshatra?.pada ? `${t('report.pada')} ${k.nakshatra.pada}` : null]
        .filter(Boolean).join(' · '),
      glyph: '✦',
    },
    {
      label: t('report.rashi'),
      value: k?.rasi?.name,
      sub: k?.rasi?.lord?.name
        ? `${PLANET_GLYPH[k.rasi.lord.name] || ''} ${k.rasi.lord.name}`.trim()
        : '',
      glyph: ZODIAC_GLYPH[k?.rasi?.name] || '☽',
    },
  ].filter((h) => h.value);

  return (
    <ScrollView style={styles.main} showsVerticalScrollIndicator={false}>
      <ReportShell title={name || t('free.basicDetails')} subtitle={t('free.nakshatraDetails')}>
        <SectionCard title={t('free.nakshatraDetails')} glyph="✦" index={0}>
          <View style={styles.heroRow}>
            {heroes.map((h) => (
              <View key={h.label} style={styles.hero}>
                <Text style={styles.heroGlyph}>{h.glyph}</Text>
                <Text style={styles.heroValue}>{h.value}</Text>
                {!!h.sub && <Text style={styles.heroSub}>{h.sub}</Text>}
                <Text style={styles.heroLabel}>{h.label}</Text>
              </View>
            ))}
          </View>

          <Divider />
          {/* The eight koots — said once, as a set. They were previously spread
              across a fourteen-row list with four of them repeated below it. */}
          <Text style={styles.subLabel}>{t('free.gunaDetails')}</Text>
          <ChipGrid
            items={KOOTS.map((key) => ({label: label(key), value: k?.koot?.[key]}))}
          />
        </SectionCard>
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  heroRow: {flexDirection: 'row', marginHorizontal: -scale(4)},
  hero: {
    flex: 1, margin: scale(4), backgroundColor: COLORS.white, borderRadius: moderateScale(10),
    borderWidth: 1, borderColor: ASTRO.line, alignItems: 'center',
    paddingVertical: verticalScale(12), paddingHorizontal: scale(6),
  },
  heroGlyph: {fontSize: moderateScale(24), color: ASTRO.gold},
  heroValue: {
    fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: ASTRO.ink,
    marginTop: 3, textAlign: 'center',
  },
  heroSub: {
    fontSize: moderateScale(10.5), fontFamily: 'Lato-Regular', color: ASTRO.muted,
    textAlign: 'center', marginTop: 1,
  },
  heroLabel: {
    fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    textTransform: 'uppercase', letterSpacing: 0.4, marginTop: verticalScale(4),
  },
  subLabel: {
    fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: verticalScale(5),
  },
});
