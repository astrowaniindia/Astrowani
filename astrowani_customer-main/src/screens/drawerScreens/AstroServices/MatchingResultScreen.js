import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {ASTRO, ReportShell} from '../../../components/astro/AstroUI';
import {KootaBreakdown, DoshaVerdict, InfoSection} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

export default function MatchingResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};

  return (
    <ScrollView style={styles.main}>
      <ReportShell title={t('result.ashtakootMatching')} subtitle="Guna Milan compatibility">
        {/* Ashtakoot returns 8 kootas, each {name, description, full_score, score}.
            Rendering them as bars against their maximum is the whole point of
            Guna Milan — the old dump printed the numbers with no sense of scale. */}
        <KootaBreakdown data={data?.ashtakoot} title={t('result.ashtakootMatching')} />
        <KootaBreakdown data={data?.dashakoot} title={t('result.dashakootMatching')} glyph="☯" />
        <InfoSection title={t('result.aggregateCompatibility')} data={data?.aggregate} glyph="∑" />
        <DoshaVerdict title={t('result.boysMangalDosh')} data={data?.boyMangalDosh} glyph="♂" />
        <DoshaVerdict title={t('result.girlsMangalDosh')} data={data?.girlMangalDosh} glyph="♀" />
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
