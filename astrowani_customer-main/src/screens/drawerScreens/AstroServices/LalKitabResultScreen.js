import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {ASTRO, ReportShell} from '../../../components/astro/AstroUI';
import {PlanetTable, InfoSection} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

export default function LalKitabResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};

  return (
    <ScrollView style={styles.main}>
      <ReportShell title={t('result.lalKitabHoroscope')} subtitle="Lal Kitab houses, debts and remedies">
        <InfoSection title={t('result.lalKitabHoroscope')} data={data?.horoscope} glyph="📕" />
        <InfoSection title={t('result.lalKitabDebts')} data={data?.debts} glyph="⚖" />
        <InfoSection title={t('result.lalKitabRemedies')} data={data?.remedies} glyph="✚" />
        <InfoSection title={t('result.lalKitabHouses')} data={data?.houses} glyph="⌂" />
        {/* Planets here may or may not use the numeric-key shape; PlanetTable
            falls back to a plain listing when it does not. */}
        <PlanetTable data={data?.planets} title={t('result.lalKitabPlanets')} />
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
