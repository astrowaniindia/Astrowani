// Free Janam Kundali result.
//
// Was: one DetailList of eight "Label — value" rows, then a horizontal strip of
// identical cards each showing THE SAME remote flaticon PNG (a placeholder URL
// repeated for Mangal Dosh and every yoga), with the yoga's whole description
// crammed into a 150pt-wide card as red text.
//
// Now it uses the same blocks as the paid Kundli report: a sign trio, attribute
// chips, a colour-coded dosha verdict, and one readable card per yoga. Nothing
// from the payload is dropped — the yoga descriptions that were being squeezed
// into a strip are now full-width prose.
import React from 'react';
import {ScrollView, StyleSheet, View, Text} from 'react-native';
import {useRoute} from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import {
  ASTRO, ReportShell, SectionCard, ChipGrid, Prose, Callout, Badge, Divider,
  ZODIAC_GLYPH,
} from '../../../components/astro/AstroUI';
import {LanguageContext} from '../../../context/LanguageContext';

export default function KundaliDetails() {
  const {t} = React.useContext(LanguageContext);
  const route = useRoute();
  const kundaliData = route.params?.kundaliData || {};
  const name = route.params?.name;

  const nd = kundaliData?.nakshatra_details || {};
  const info = nd?.additional_info || {};

  if (!kundaliData || Object.keys(kundaliData).length === 0) {
    return (
      <View style={[styles.main, styles.center]}>
        <Ionicons name="alert-circle-outline" size={moderateScale(34)} color={ASTRO.muted} />
        <Text style={styles.errorText}>{t('free.noKundaliData')}</Text>
      </View>
    );
  }

  // The three signs are the headline — they were three rows in a list of eight.
  const signs = [
    {label: t('report.nakshatra'), value: nd?.nakshatra?.name, glyph: '✦'},
    {label: t('report.moonSign'), value: nd?.chandra_rasi?.name, glyph: ZODIAC_GLYPH[nd?.chandra_rasi?.name] || '☽'},
    {label: t('report.sunSign'), value: nd?.soorya_rasi?.name, glyph: ZODIAC_GLYPH[nd?.soorya_rasi?.name] || '☉'},
  ].filter((s) => s.value);

  const chips = [
    {label: t('report.sign'), value: nd?.zodiac?.name},
    {label: 'Deity', value: info?.deity},
    {label: 'Ganam', value: info?.ganam},
    {label: 'Symbol', value: info?.symbol},
    {label: 'Animal Sign', value: info?.animal_sign},
    {label: 'Nadi', value: info?.nadi},
    {label: 'Colour', value: info?.color},
    {label: 'Best Direction', value: info?.best_direction},
    {label: 'Syllables', value: info?.syllables},
    {label: 'Enemy Yoni', value: info?.enemy_yoni},
  ];

  const hasDosha = kundaliData?.mangal_dosha?.has_dosha;
  const doshaKnown = typeof hasDosha === 'boolean';
  const yogas = Array.isArray(kundaliData?.yoga_details) ? kundaliData.yoga_details : [];

  return (
    <ScrollView style={styles.main} showsVerticalScrollIndicator={false}>
      <ReportShell title={name || t('free.birthSummary')} subtitle={t('free.nakshatraDetails')}>
        <SectionCard title={t('free.nakshatraDetails')} glyph="✦" index={0}>
          {!!signs.length && (
            <View style={styles.signRow}>
              {signs.map((s) => (
                <View key={s.label} style={styles.signCard}>
                  <Text style={styles.signGlyph}>{s.glyph}</Text>
                  <Text style={styles.signValue}>{s.value}</Text>
                  <Text style={styles.signLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          )}
          {!!signs.length && <Divider />}
          <ChipGrid items={chips} />
        </SectionCard>

        {doshaKnown && (
          <SectionCard title={t('result.mangalDosh')} glyph="♂" index={1}>
            <View style={styles.doshaRow}>
              <Ionicons
                name={hasDosha ? 'alert-circle' : 'shield-checkmark'}
                size={moderateScale(44)}
                color={hasDosha ? ASTRO.bad : ASTRO.good}
              />
              <View style={styles.doshaSide}>
                <Badge
                  text={hasDosha ? t('report.present') : t('report.notPresent')}
                  tone={hasDosha ? 'bad' : 'good'}
                />
                {!!kundaliData?.mangal_dosha?.description && (
                  <Text style={styles.doshaText}>{kundaliData.mangal_dosha.description}</Text>
                )}
              </View>
            </View>
          </SectionCard>
        )}

        {!!yogas.length && (
          <SectionCard title={t('free.doshasAndYogas')} glyph="◈" subtitle={`${yogas.length}`} index={2}>
            {yogas.map((y, i) => (
              <View key={i} style={styles.yoga}>
                <View style={styles.yogaHead}>
                  <View style={styles.yogaDot}>
                    <Text style={styles.yogaDotText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.yogaName}>{y.name || 'Yoga'}</Text>
                </View>
                {/* Full description, full width — it used to be squeezed into a
                    150pt card in a horizontal strip. */}
                {!!y.description && <Prose>{y.description}</Prose>}
              </View>
            ))}
          </SectionCard>
        )}

        {!doshaKnown && !yogas.length && (
          <SectionCard glyph="◆" title={t('free.doshasAndYogas')} index={1}>
            <Callout icon="information-circle">{t('free.noKundaliData')}</Callout>
          </SectionCard>
        )}
      </ReportShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  center: {alignItems: 'center', justifyContent: 'center'},
  errorText: {
    fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    marginTop: verticalScale(8),
  },

  signRow: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -scale(4)},
  signCard: {
    flexGrow: 1, flexBasis: '28%', margin: scale(4), backgroundColor: COLORS.white,
    borderRadius: moderateScale(10), borderWidth: 1, borderColor: ASTRO.line,
    alignItems: 'center', paddingVertical: verticalScale(10), paddingHorizontal: scale(4),
  },
  signGlyph: {fontSize: moderateScale(22), color: ASTRO.gold},
  signValue: {
    fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.ink,
    marginTop: 3, textAlign: 'center',
  },
  signLabel: {
    fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1, textAlign: 'center',
  },

  doshaRow: {flexDirection: 'row', alignItems: 'center'},
  doshaSide: {flex: 1, marginLeft: scale(12)},
  doshaText: {
    fontSize: moderateScale(12), lineHeight: moderateScale(19), fontFamily: 'Lato-Regular',
    color: ASTRO.ink, marginTop: verticalScale(6),
  },

  yoga: {
    borderWidth: 1, borderColor: ASTRO.line, borderRadius: moderateScale(10),
    backgroundColor: COLORS.white, padding: scale(10), marginBottom: verticalScale(8),
  },
  yogaHead: {flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(5)},
  yogaDot: {
    width: moderateScale(20), height: moderateScale(20), borderRadius: moderateScale(10),
    backgroundColor: ASTRO.gold, alignItems: 'center', justifyContent: 'center',
    marginRight: scale(8),
  },
  yogaDotText: {fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: COLORS.white},
  yogaName: {flex: 1, fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
});
