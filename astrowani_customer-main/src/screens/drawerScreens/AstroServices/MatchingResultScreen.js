import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {ASTRO, ReportShell} from '../../../components/astro/AstroUI';
import {KootaBreakdown, DoshaVerdict, AggregateMatch} from '../../../components/astro/AstroBlocks';
import {useReportLanguage, TranslatingOverlay} from '../../../components/astro/ReportLanguage';
import {LanguageContext} from '../../../context/LanguageContext';

export default function MatchingResultScreen({route, navigation}) {
  const {t} = React.useContext(LanguageContext);
  const {data, busy} = useReportLanguage(route, navigation);

  return (
    <View style={styles.main}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ReportShell title={t('report.kundaliMatching')} subtitle={t('report.matchingSub')}>
          {/* The overall verdict leads. Previously the aggregate payload was the LAST
              section and rendered as a raw key/value dump — the reader met "MANGLIKDOSH
              SATURN POINTS / Boy false / Girl false" five times before reaching the score
              they bought the report for. */}
          <AggregateMatch data={data?.aggregate} title={t('result.aggregateCompatibility')} index={0} />

          {/* Ashtakoot returns 8 kootas, each {name, description, full_score, score}.
              Rendering them as bars against their maximum is the whole point of Guna
              Milan — a dump of numbers gives no sense of scale. */}
          <KootaBreakdown data={data?.ashtakoot} title={t('result.ashtakootMatching')} index={1} />
          <KootaBreakdown data={data?.dashakoot} title={t('result.dashakootMatching')} glyph="☯" index={2} />

          <DoshaVerdict title={t('result.boysMangalDosh')} data={data?.boyMangalDosh} glyph="♂" index={3} />
          <DoshaVerdict title={t('result.girlsMangalDosh')} data={data?.girlMangalDosh} glyph="♀" index={4} />
        </ReportShell>
      </ScrollView>
      <TranslatingOverlay visible={busy} label={t('report.translating')} />
    </View>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
