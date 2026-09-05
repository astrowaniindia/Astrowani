import React from 'react';
import {ScrollView, StyleSheet, View, Text} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import {ASTRO, ReportShell, SectionCard, PLANET_GLYPH} from '../../../components/astro/AstroUI';
import {DashaTimeline, InfoSection} from '../../../components/astro/AstroBlocks';
import {useReportLanguage, TranslatingOverlay} from '../../../components/astro/ReportLanguage';
import {LanguageContext} from '../../../context/LanguageContext';
import useConfirmLeaveReport from '../../../hooks/useConfirmLeaveReport';

/**
 * The five nested levels that are running RIGHT NOW, as one stack.
 *
 * current-mahadasha-full returns `order_of_dashas` — major → minor → sub-minor →
 * sub-sub-minor → sub-sub-sub-minor, each {name, start, end}. That is the single
 * most-wanted answer in a dasha report ("what period am I in?") and it was previously
 * spread across five separate timelines the reader had to reassemble.
 */
const LEVELS = [
  ['major', 'Mahadasha', 'report.majorPeriod'],
  ['minor', 'Antardasha', 'report.subPeriod'],
  ['sub_minor', 'Pratyantardasha', 'report.subSubPeriod'],
  ['sub_sub_minor', 'Sookshma Dasha', 'report.finerPeriod'],
  ['sub_sub_sub_minor', 'Prana Dasha', 'report.finestPeriod'],
];

function CurrentStack({order, index}) {
  const {t} = React.useContext(LanguageContext);
  const rows = LEVELS
    .map(([key, label, hintKey]) => ({...(order?.[key] || {}), label, hint: t(hintKey)}))
    .filter((r) => r.name);
  if (!rows.length) return null;

  return (
    <SectionCard
      title={t('report.runningNow')}
      glyph="◉"
      subtitle={t('report.runningNowSub')}
      index={index}>
      {rows.map((r, i) => (
        <View key={r.label} style={styles.lvl}>
          <View style={styles.lvlRail}>
            <View style={[styles.lvlDot, {opacity: 1 - i * 0.14}]} />
            {i < rows.length - 1 && <View style={styles.lvlLine} />}
          </View>
          {/* Indent grows with depth so the nesting is visible, not just stated. */}
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

export default function DashaResultScreen({route, navigation}) {
  const {t} = React.useContext(LanguageContext);
  const {data, busy} = useReportLanguage(route, navigation);
  // Paid content: confirm before a reflex back-press throws it away.
  useConfirmLeaveReport(navigation, !busy);
  const cur = data?.currentMahadashaFull;

  return (
    <View style={styles.main}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ReportShell title={t('result.currentMahadasha')} subtitle={t('report.dashaSub')}>
          <CurrentStack order={cur?.order_of_dashas} index={0} />

          {/* Each level is also a full sequence. DashaTimeline opens on the period that
              contains today and folds the rest away, so the reader lands on what is
              relevant instead of scrolling from 1998. */}
          <DashaTimeline title="Mahadasha" periods={cur?.mahadasha} subtitle={t('report.majorPeriods')} index={1} />
          <DashaTimeline title="Antardasha" periods={cur?.antardasha} subtitle={t('report.withinMahadasha')} index={2} />
          <DashaTimeline title="Pratyantardasha" periods={cur?.paryantardasha} subtitle={t('report.withinAntardasha')} index={3} />

          {/* Parallel-array shapes — zipped inside DashaTimeline / DashaGroups. */}
          <DashaTimeline title={t('result.mahadashaTimeline')} periods={data?.mahadasha} subtitle={t('report.vimshottariSequence')} index={4} />
          <DashaTimeline title={t('result.yoginiDashaMain')} periods={data?.yoginiDashaMain} subtitle={t('report.yoginiMajor')} index={5} />
          {/* yoginiDashaSub is a list of GROUPS each holding its own parallel arrays —
              DashaTimeline detects that shape and hands off to DashaGroups. */}
          <DashaTimeline title={t('result.yoginiDashaSub')} periods={data?.yoginiDashaSub} subtitle={t('report.yoginiSub')} index={6} />

          {!cur && !data?.mahadasha && <InfoSection title={t('result.currentMahadasha')} data={data} />}
        </ReportShell>
      </ScrollView>
      <TranslatingOverlay visible={busy} label={t('report.translating')} />
    </View>
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
