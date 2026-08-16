import React from 'react';
import {ScrollView, StyleSheet, View, Text} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import {
  ASTRO, ReportShell, SectionCard, PLANET_GLYPH,
} from '../../../components/astro/AstroUI';
import {DashaTimeline, InfoSection} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

/**
 * The five nested levels that are running RIGHT NOW, as one stack.
 *
 * current-mahadasha-full returns `order_of_dashas` — major → minor → sub-minor →
 * sub-sub-minor → sub-sub-sub-minor, each {name, start, end}. That is the single
 * most-wanted answer in a dasha report ("what period am I in?") and it was
 * previously spread across five separate timelines the reader had to reassemble.
 */
const LEVELS = [
  ['major', 'Mahadasha', 'Major period'],
  ['minor', 'Antardasha', 'Sub period'],
  ['sub_minor', 'Pratyantardasha', 'Sub-sub period'],
  ['sub_sub_minor', 'Sookshma Dasha', 'Finer period'],
  ['sub_sub_sub_minor', 'Prana Dasha', 'Finest period'],
];

function CurrentStack({order, index}) {
  const rows = LEVELS
    .map(([key, label, hint]) => ({...(order?.[key] || {}), label, hint}))
    .filter((r) => r.name);
  if (!rows.length) return null;

  return (
    <SectionCard
      title="Running Right Now"
      glyph="◉"
      subtitle="Your five active dasha levels, outermost first"
      index={index}>
      {rows.map((r, i) => (
        <View key={r.label} style={styles.lvl}>
          <View style={styles.lvlRail}>
            <View style={[styles.lvlDot, {opacity: 1 - i * 0.14}]} />
            {i < rows.length - 1 && <View style={styles.lvlLine} />}
          </View>
          <View style={[styles.lvlCard, {marginLeft: scale(i * 6)}]}>
            <View style={styles.lvlTop}>
              <Text style={styles.lvlName}>
                {PLANET_GLYPH[r.name] ? `${PLANET_GLYPH[r.name]} ` : ''}{r.name}
              </Text>
              <Text style={styles.lvlLabel}>{r.label}</Text>
            </View>
            <Text style={styles.lvlDates}>{r.start} → {r.end}</Text>
            <Text style={styles.lvlHint}>{r.hint}</Text>
          </View>
        </View>
      ))}
    </SectionCard>
  );
}

export default function DashaResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};
  const cur = data?.currentMahadashaFull;

  return (
    <ScrollView style={styles.main} showsVerticalScrollIndicator={false}>
      <ReportShell title={t('result.currentMahadasha')} subtitle="Planetary periods across your life">
        <CurrentStack order={cur?.order_of_dashas} index={0} />

        {/* Each level is also a full sequence. DashaTimeline opens on the period
            that contains today and folds the rest away, so the reader lands on
            what is relevant instead of scrolling from 1998. */}
        <DashaTimeline title="Mahadasha" periods={cur?.mahadasha} subtitle="Major periods" index={1} />
        <DashaTimeline title="Antardasha" periods={cur?.antardasha} subtitle="Within the current Mahadasha" index={2} />
        <DashaTimeline title="Pratyantardasha" periods={cur?.paryantardasha} subtitle="Within the current Antardasha" index={3} />

        {/* Parallel-array shape — zipped inside DashaTimeline (see AstroBlocks). */}
        <DashaTimeline title={t('result.mahadashaTimeline')} periods={data?.mahadasha} subtitle="Vimshottari sequence" index={4} />
        <DashaTimeline title={t('result.yoginiDashaMain')} periods={data?.yoginiDashaMain} subtitle="Yogini major periods" index={5} />
        <DashaTimeline title={t('result.yoginiDashaSub')} periods={data?.yoginiDashaSub} subtitle="Yogini sub periods" index={6} />

        {!cur && !data?.mahadasha && <InfoSection title="Dasha" data={data} />}
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  lvl: {flexDirection: 'row', alignItems: 'stretch'},
  lvlRail: {width: scale(16), alignItems: 'center'},
  lvlDot: {
    width: scale(10), height: scale(10), borderRadius: scale(5),
    backgroundColor: ASTRO.maroon, marginTop: verticalScale(12),
  },
  lvlLine: {flex: 1, width: 1.5, backgroundColor: ASTRO.line},
  lvlCard: {
    flex: 1, backgroundColor: COLORS.white, borderWidth: 1, borderColor: ASTRO.line,
    borderRadius: moderateScale(9), padding: scale(9), marginBottom: verticalScale(7),
  },
  lvlTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  lvlName: {fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  lvlLabel: {
    fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  lvlDates: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.ink, marginTop: 2},
  lvlHint: {fontSize: moderateScale(9.5), fontFamily: 'Lato-Regular', color: ASTRO.muted},
});
