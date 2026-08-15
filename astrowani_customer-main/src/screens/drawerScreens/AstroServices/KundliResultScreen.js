import React from 'react';
import {ScrollView, StyleSheet, View, Text} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {scale, verticalScale, moderateScale} from '../../../utils/Scaling';
import {ASTRO, ReportShell, SectionCard, Prose} from '../../../components/astro/AstroUI';
import {PlanetTable, KundliAttributes, InfoSection} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

// The ascendant report comes back as an array of objects (one per ascendant
// aspect) with a long `general_prediction` — reads as prose, not a table.
function AscendantSection({data, title}) {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (!rows.length) return null;
  const first = rows[0] || {};
  return (
    <SectionCard title={title} glyph="↑" subtitle={first.ascendant ? `${first.ascendant} ascendant` : undefined}>
      {rows.map((r, i) => (
        <View key={i} style={i ? {marginTop: verticalScale(10)} : null}>
          {!!r.ascendant_lord && (
            <Text style={styles.lord}>
              Lord: {r.ascendant_lord}
              {r.ascendant_lord_house_location ? ` · House ${r.ascendant_lord_house_location}` : ''}
            </Text>
          )}
          <Prose>{r.general_prediction || r.prediction || ''}</Prose>
        </View>
      ))}
    </SectionCard>
  );
}

export default function KundliResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};

  return (
    <ScrollView style={styles.main}>
      <ReportShell title={t('result.kundliOverview')} subtitle="Birth chart, positions and attributes">
        {!!data?.chartSvg && (
          <SectionCard title="Lagna Chart (D1)" glyph="✧">
            <View style={styles.chartWrap}>
              <SvgXml xml={data.chartSvg} width="100%" height={moderateScale(300)} />
            </View>
          </SectionCard>
        )}

        <KundliAttributes data={data?.extendedKundali} title="Birth Attributes" />
        <AscendantSection data={data?.ascendantReport} title={t('result.ascendantReport')} />
        <PlanetTable data={data?.planetDetails} title={t('result.planetDetails')} />

        {/* Anything the blocks above did not consume still renders, so a payload
            change can never make a paid report look empty. */}
        {!data?.extendedKundali && !data?.planetDetails && (
          <InfoSection title="Report" data={data} />
        )}
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  chartWrap: {alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, padding: scale(6)},
  lord: {
    fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    marginBottom: verticalScale(4),
  },
});
