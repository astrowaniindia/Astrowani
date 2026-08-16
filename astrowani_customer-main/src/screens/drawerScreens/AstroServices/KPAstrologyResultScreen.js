import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {ASTRO, ReportShell, SectionCard} from '../../../components/astro/AstroUI';
import ZoomableChart from '../../../components/astro/ZoomableChart';
import {PlanetTable, KpCusps, KpSignificators} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

export default function KPAstrologyResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};
  // kp/planet_details nests the list under `planets` with the ascendant beside
  // it — PlanetTable understands that shape, but the ascendant is worth showing
  // in the same list rather than dropping it.
  const planets = data?.planetDetails?.planets
    ? [...data.planetDetails.planets, ...(data.planetDetails.ascendant ? [data.planetDetails.ascendant] : [])]
    : data?.planetDetails;

  return (
    <ScrollView style={styles.main} showsVerticalScrollIndicator={false}>
      <ReportShell title="KP Astrology" subtitle="Krishnamurti Paddhati chart and significators">
        {!!data?.chartSvg && (
          <SectionCard title="KP Chart" glyph="✧" subtitle="Tap to zoom" index={0}>
            <ZoomableChart svg={data.chartSvg} title="KP Chart" />
          </SectionCard>
        )}
        <PlanetTable data={planets} title={t('result.planetDetails')} index={1} />
        <KpCusps data={data?.cuspDetails} title={t('result.cuspDetails')} index={2} />
        <KpSignificators data={data?.houseSignificators} title={t('result.houseSignificators')} index={3} />
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
