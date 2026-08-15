import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {scale, moderateScale} from '../../../utils/Scaling';
import {ASTRO, ReportShell, SectionCard} from '../../../components/astro/AstroUI';
import {PlanetTable, InfoSection} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

export default function KPAstrologyResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};

  return (
    <ScrollView style={styles.main}>
      <ReportShell title="KP Astrology" subtitle="Krishnamurti Paddhati chart and significators">
        {!!data?.chartSvg && (
          <SectionCard title="KP Chart" glyph="✧">
            <View style={styles.chartWrap}>
              <SvgXml xml={data.chartSvg} width="100%" height={moderateScale(300)} />
            </View>
          </SectionCard>
        )}
        <PlanetTable data={data?.planetDetails} title={t('result.planetDetails')} />
        <InfoSection title={t('result.cuspDetails')} data={data?.cuspDetails} glyph="◑" />
        <InfoSection title={t('result.houseSignificators')} data={data?.houseSignificators} glyph="⌂" />
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  chartWrap: {alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, padding: scale(6)},
});
