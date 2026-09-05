import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {ASTRO, ReportShell} from '../../../components/astro/AstroUI';
import {
  NumerologyNumbers, NameAnalysis, MobileAnalysis, LuckyThings, PersonalYear,
} from '../../../components/astro/AstroBlocks';
import {useReportLanguage, TranslatingOverlay} from '../../../components/astro/ReportLanguage';
import {LanguageContext} from '../../../context/LanguageContext';
import useConfirmLeaveReport from '../../../hooks/useConfirmLeaveReport';

export default function NumerologyResultScreen({route, navigation}) {
  const {t} = React.useContext(LanguageContext);
  const {data, busy} = useReportLanguage(route, navigation);
  // Paid content: confirm before a reflex back-press throws it away.
  useConfirmLeaveReport(navigation, !busy);

  return (
    <View style={styles.main}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ReportShell title={t('report.numerologyReport')} subtitle={t('report.numerologySub')}>
          {/* loshu-grid returns the 3x3 magic square plus radical/destiny/kua/psychic/
              lifePath numbers and plane percentages. The square is drawn as a square —
              printing it as nine key/value rows threw away the one thing that makes it
              readable: which cells are empty. */}
          <NumerologyNumbers data={data?.loshuGrid} title={t('result.loshuGrid')} index={0} />
          <PersonalYear data={data?.personalYear} title={t('result.personalYear')} index={1} />
          <LuckyThings data={data?.luckyThings} title={t('result.luckyThings')} index={2} />
          {/* Was the worst remaining dump — every field printed as
              "NameCompatibilityAsPerBhagyank : Great!! …" with the key run together. */}
          <NameAnalysis data={data?.nameAnalysis} title={t('result.nameAnalysis')} index={3} />
          <MobileAnalysis data={data?.mobileAnalysis} title={t('result.mobileAnalysis')} index={4} />
        </ReportShell>
      </ScrollView>
      <TranslatingOverlay visible={busy} label={t('report.translating')} />
    </View>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
