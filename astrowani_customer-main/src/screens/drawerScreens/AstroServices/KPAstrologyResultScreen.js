import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {ASTRO, ReportShell, SectionCard} from '../../../components/astro/AstroUI';
import ZoomableChart from '../../../components/astro/ZoomableChart';
import {PlanetTable, KpCusps, KpSignificators} from '../../../components/astro/AstroBlocks';
import {useReportLanguage, TranslatingOverlay} from '../../../components/astro/ReportLanguage';
import {LanguageContext} from '../../../context/LanguageContext';

export default function KPAstrologyResultScreen({route, navigation}) {
  const {t} = React.useContext(LanguageContext);
  const {data, busy} = useReportLanguage(route, navigation);

  // kp/planet_details nests the list under `planets` with the ascendant beside it —
  // PlanetTable understands that shape, but the ascendant is worth showing in the same
  // list rather than dropping it.
  const planets = data?.planetDetails?.planets
    ? [...data.planetDetails.planets, ...(data.planetDetails.ascendant ? [data.planetDetails.ascendant] : [])]
    : data?.planetDetails;

  return (
    <View style={styles.main}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ReportShell title="KP Astrology" subtitle={t('report.kpSub')}>
          {!!data?.chartSvg && (
            <SectionCard title="KP Chart" glyph="✧" subtitle={t('report.tapToZoom')} index={0}>
              <ZoomableChart svg={data.chartSvg} title="KP Chart" />
            </SectionCard>
          )}
          <PlanetTable data={planets} title={t('result.planetDetails')} index={1} />
          <KpCusps data={data?.cuspDetails} title={t('result.cuspDetails')} index={2} />
          <KpSignificators data={data?.houseSignificators} title={t('result.houseSignificators')} index={3} />
        </ReportShell>
      </ScrollView>
      <TranslatingOverlay visible={busy} label={t('report.translating')} />
    </View>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
