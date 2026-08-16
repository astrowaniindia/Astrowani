import React from 'react';
import {ScrollView, StyleSheet, View, Text} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import {ASTRO, ReportShell, SectionCard, Callout} from '../../../components/astro/AstroUI';
import {DoshaVerdict} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

/**
 * At-a-glance summary of all four doshas.
 *
 * Without it the reader has to scroll through four long sections — each ending
 * in ten remedies — before they can answer "so which ones do I actually have?".
 * This puts the four answers on the first screen and lets the detail follow.
 */
function DoshaSummary({items, index}) {
  const known = items.filter((i) => i.present !== null);
  if (!known.length) return null;
  const affected = known.filter((i) => i.present);

  return (
    <SectionCard title="At a Glance" glyph="◉" subtitle="All four doshas" index={index}>
      <Callout tone={affected.length ? 'warn' : 'good'} icon={affected.length ? 'alert-circle' : 'shield-checkmark'}>
        {affected.length
          ? `${affected.length} of ${known.length} doshas are present in your chart: ${affected.map((a) => a.label).join(', ')}. Remedies for each are listed below.`
          : 'None of the four doshas are present in your chart.'}
      </Callout>
      <View style={styles.grid}>
        {known.map((i) => (
          <View
            key={i.label}
            style={[styles.tile, i.present ? styles.tileBad : styles.tileGood]}>
            <Ionicons
              name={i.present ? 'alert-circle' : 'checkmark-circle'}
              size={moderateScale(22)}
              color={i.present ? ASTRO.bad : ASTRO.good}
            />
            <Text style={styles.tileLabel} numberOfLines={2}>{i.label}</Text>
            <Text style={[styles.tileState, {color: i.present ? ASTRO.bad : ASTRO.good}]}>
              {i.present ? 'Present' : 'Clear'}
            </Text>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

// manglik-dosh has no is_dosha_present flag — it reports three independent
// sources instead, so derive presence the same way DoshaVerdict does.
function presence(d) {
  if (!d || typeof d !== 'object') return null;
  if (typeof d.is_dosha_present === 'boolean') return d.is_dosha_present;
  const sources = ['manglik_by_mars', 'manglik_by_saturn', 'manglik_by_rahuketu']
    .filter((k) => typeof d[k] === 'boolean');
  return sources.length ? sources.some((k) => d[k]) : null;
}

export default function DoshResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};

  const items = [
    {label: t('result.mangalDosh'), present: presence(data?.mangalDosh)},
    {label: t('result.kaalsarpDosh'), present: presence(data?.kaalsarpDosh)},
    {label: t('result.manglikDosh'), present: presence(data?.manglikDosh)},
    {label: t('result.pitraDosh'), present: presence(data?.pitraDosh)},
  ];

  return (
    <ScrollView style={styles.main} showsVerticalScrollIndicator={false}>
      <ReportShell title="Dosha Analysis" subtitle="What is present, how strong, and what to do">
        <DoshaSummary items={items} index={0} />
        <DoshaVerdict title={t('result.mangalDosh')} data={data?.mangalDosh} glyph="♂" index={1} />
        <DoshaVerdict title={t('result.kaalsarpDosh')} data={data?.kaalsarpDosh} glyph="☊" index={2} />
        <DoshaVerdict title={t('result.manglikDosh')} data={data?.manglikDosh} glyph="♂" index={3} />
        <DoshaVerdict title={t('result.pitraDosh')} data={data?.pitraDosh} glyph="☉" index={4} />
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  grid: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -scale(4)},
  tile: {
    flexGrow: 1, flexBasis: '40%', margin: scale(4), alignItems: 'center',
    borderRadius: moderateScale(10), borderWidth: 1, paddingVertical: verticalScale(11),
    paddingHorizontal: scale(6), backgroundColor: COLORS.white,
  },
  tileGood: {borderColor: '#CDE8CE', backgroundColor: '#F4FBF4'},
  tileBad: {borderColor: '#F3D2CC', backgroundColor: '#FEF7F5'},
  tileLabel: {
    fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.ink,
    textAlign: 'center', marginTop: verticalScale(4),
  },
  tileState: {
    fontSize: moderateScale(9.5), fontFamily: 'Lato-Bold',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1,
  },
});
