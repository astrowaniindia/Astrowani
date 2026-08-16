import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {ASTRO, ReportShell} from '../../../components/astro/AstroUI';
import {
  PlanetTable, LalKitabHoroscope, LalKitabHouses, LalKitabRemedies, LalKitabDebts,
} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

export default function LalKitabResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};

  return (
    <ScrollView style={styles.main} showsVerticalScrollIndicator={false}>
      <ReportShell title="Lal Kitab Report" subtitle="Chart, houses, debts and remedies">
        {/* The horoscope payload is twelve houses with their planets — a chart in
            list form. Drawn as a grid it is a chart again. */}
        <LalKitabHoroscope data={data?.horoscope} title={t('result.lalKitabHoroscope')} index={0} />
        <PlanetTable data={data?.planets} title={t('result.lalKitabPlanets')} index={1} />
        <LalKitabHouses data={data?.houses} title={t('result.lalKitabHouses')} index={2} />
        <LalKitabDebts data={data?.debts} title={t('result.lalKitabDebts')} index={3} />
        {/* Nine planets × (a paragraph of effects + up to five remedies) is far
            too much to print flat — one collapsible per planet instead. */}
        <LalKitabRemedies data={data?.remedies} title={t('result.lalKitabRemedies')} index={4} />
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
