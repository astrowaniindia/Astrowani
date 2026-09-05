import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {ASTRO, ReportShell} from '../../../components/astro/AstroUI';
import {
  PlanetTable, LalKitabHoroscope, LalKitabHouses, LalKitabRemedies, LalKitabDebts,
} from '../../../components/astro/AstroBlocks';
import {useReportLanguage, TranslatingOverlay} from '../../../components/astro/ReportLanguage';
import {LanguageContext} from '../../../context/LanguageContext';
import useConfirmLeaveReport from '../../../hooks/useConfirmLeaveReport';

export default function LalKitabResultScreen({route, navigation}) {
  const {t} = React.useContext(LanguageContext);
  const {data, busy} = useReportLanguage(route, navigation);
  // Paid content: confirm before a reflex back-press throws it away.
  useConfirmLeaveReport(navigation, !busy);

  return (
    <View style={styles.main}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ReportShell title={t('report.lalKitabReport')} subtitle={t('report.lalKitabSub')}>
          {/* The horoscope payload is twelve houses with their planets — a chart in list
              form. Drawn as a grid it is a chart again. */}
          <LalKitabHoroscope data={data?.horoscope} title={t('result.lalKitabHoroscope')} index={0} />
          <PlanetTable data={data?.planets} title={t('result.lalKitabPlanets')} index={1} />
          <LalKitabHouses data={data?.houses} title={t('result.lalKitabHouses')} index={2} />
          <LalKitabDebts data={data?.debts} title={t('result.lalKitabDebts')} index={3} />
          {/* Nine planets × (a paragraph of effects + up to five remedies) is far too much
              to print flat — one collapsible per planet instead. Nothing is dropped. */}
          <LalKitabRemedies data={data?.remedies} title={t('result.lalKitabRemedies')} index={4} />
        </ReportShell>
      </ScrollView>
      <TranslatingOverlay visible={busy} label={t('report.translating')} />
    </View>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
