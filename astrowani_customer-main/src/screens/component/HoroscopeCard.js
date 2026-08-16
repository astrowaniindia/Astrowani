// Horoscope reading card (Daily / Monthly / Yearly tabs).
//
// Was a centred remote stock image — the SAME hardcoded Bing URL for every sign,
// so it identified nothing and failed to load offline — over a bare paragraph.
// Now: the sign's own zodiac glyph, the period as a badge, and the prediction as
// proper prose on the same parchment surface the paid reports use.
import React from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import {
  ASTRO, SectionCard, Prose, Callout, ZODIAC_GLYPH, ConsultCta,
} from '../../components/astro/AstroUI';
import {LanguageContext} from '../../context/LanguageContext';

// The API returns the sign name; the glyph map is keyed on the English name, and
// (since the reports pass) also on the Hindi one.
function glyphFor(sign) {
  return ZODIAC_GLYPH[sign] || ZODIAC_GLYPH[String(sign || '').trim()] || '✦';
}

export default function HoroscopeCard({data, tab}) {
  const {t} = React.useContext(LanguageContext);

  const periodLabel = () => {
    const date = new Date();
    if (tab === 'monthly') return date.toLocaleString('en-US', {month: 'long', year: 'numeric'});
    if (tab === 'yearly') return String(date.getFullYear());
    return date.toLocaleDateString('en-US', {
      weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
    });
  };

  const tabLabel = tab === 'monthly' ? t('free.monthly')
    : tab === 'yearly' ? t('free.yearly') : t('free.daily');

  // The free-services endpoint currently returns one `prediction` string; the
  // monthly/yearly tabs reuse it until per-period endpoints exist. Read whatever
  // richer shape is present rather than assuming, and never blank the card out.
  const text = data?.[tab]?.description
    || data?.prediction
    || data?.daily?.description
    || '';

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <SectionCard title={data?.zodiacSign || '—'} glyph={glyphFor(data?.zodiacSign)}>
        <View style={styles.hero}>
          <Text style={styles.heroGlyph}>{glyphFor(data?.zodiacSign)}</Text>
          <View style={styles.heroSide}>
            <View style={styles.periodBadge}>
              <Text style={styles.periodBadgeText}>{tabLabel}</Text>
            </View>
            <Text style={styles.periodDate}>{periodLabel()}</Text>
          </View>
        </View>

        {text
          ? <Prose>{text}</Prose>
          : <Callout icon="information-circle">{t('horoscope.unableToFetch')}</Callout>}
      </SectionCard>

      {!!text && <ConsultCta source="horoscope_detail" />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {paddingTop: verticalScale(12), paddingBottom: verticalScale(28)},
  hero: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: ASTRO.line, borderRadius: moderateScale(12),
    padding: scale(12), marginBottom: verticalScale(12),
  },
  heroGlyph: {fontSize: moderateScale(40), color: ASTRO.gold},
  heroSide: {flex: 1, marginLeft: scale(12)},
  periodBadge: {
    alignSelf: 'flex-start', backgroundColor: ASTRO.goldSoft, borderRadius: 20,
    paddingHorizontal: scale(10), paddingVertical: verticalScale(3),
  },
  periodBadgeText: {fontSize: moderateScale(10.5), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  periodDate: {
    fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.ink,
    marginTop: verticalScale(5),
  },
});
