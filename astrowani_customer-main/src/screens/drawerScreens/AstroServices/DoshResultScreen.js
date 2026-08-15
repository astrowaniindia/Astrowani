import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {ASTRO, ReportShell} from '../../../components/astro/AstroUI';
import {DoshaVerdict} from '../../../components/astro/AstroBlocks';
import {LanguageContext} from '../../../context/LanguageContext';

export default function DoshResultScreen({route}) {
  const {t} = React.useContext(LanguageContext);
  const {data} = route.params || {};

  return (
    <ScrollView style={styles.main}>
      <ReportShell title={t('result.mangalDosh')} subtitle="Dosha analysis and remedies">
        {/* Each dosha payload carries is_dosha_present (+ score, factors,
            cancellation, remedies). DoshaVerdict turns that into a colour-coded
            verdict with an intensity bar — the answer the reader wants is
            "do I have it or not", which the old key/value dump never stated. */}
        <DoshaVerdict title={t('result.mangalDosh')} data={data?.mangalDosh} glyph="♂" />
        <DoshaVerdict title={t('result.kaalsarpDosh')} data={data?.kaalsarpDosh} glyph="☊" />
        <DoshaVerdict title={t('result.manglikDosh')} data={data?.manglikDosh} glyph="♂" />
        <DoshaVerdict title={t('result.pitraDosh')} data={data?.pitraDosh} glyph="☉" />
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({main: {flex: 1, backgroundColor: ASTRO.parchmentDeep}});
