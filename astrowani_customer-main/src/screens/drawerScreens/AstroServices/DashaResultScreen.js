import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {ASTRO, ReportShell} from '../../../components/astro/AstroUI';
import {DashaTimeline, InfoSection} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

export default function DashaResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};
  const cur = data?.currentMahadashaFull;

  return (
    <ScrollView style={styles.main}>
      <ReportShell title={t('result.currentMahadasha')} subtitle="Planetary periods across your life">
        {/* current-mahadasha-full nests each level (mahadasha, antardasha, …) as
            its own array of {name,start,end} — render each as a timeline so the
            active period is visible instead of buried in a key/value dump. */}
        <DashaTimeline title="Mahadasha" periods={cur?.mahadasha} />
        <DashaTimeline title="Antardasha" periods={cur?.antardasha} />
        <DashaTimeline title="Paryantardasha" periods={cur?.paryantardasha} />
        <DashaTimeline title={t('result.mahadashaTimeline')} periods={data?.mahadasha} />
        <DashaTimeline title={t('result.yoginiDashaMain')} periods={data?.yoginiDashaMain} />
        <DashaTimeline title={t('result.yoginiDashaSub')} periods={data?.yoginiDashaSub} />
        {!cur && !data?.mahadasha && <InfoSection title="Dasha" data={data} />}
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
