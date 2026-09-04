// Daily horoscope picker.
//
// Was: a row of plain text chips, then a card showing THE SAME hardcoded Bing
// stock image for all twelve signs (a placeholder URL that had shipped as-is),
// with the prediction itself hidden behind a tap. Nothing identified the sign
// you had picked except its name.
//
// Now: a twelve-sign grid using the real zodiac glyphs (no remote images to load
// or 404), the selected sign as an animated hero, and the day's prediction read
// right there — with the Daily/Monthly/Yearly detail still one tap away.
import React, {useEffect, useRef, useState} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Animated, Easing,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import {LanguageContext} from '../../../context/LanguageContext';
import {FREE_SERVICES_URL} from '../../../config/api';
import {
  ASTRO, SectionCard, Prose, Callout, ZODIAC_GLYPH, Reveal, ConsultCta,
} from '../../../components/astro/AstroUI';
import {useFreeServiceLanguage} from '../../../components/astro/ReportLanguage';
import { captureEvent } from '../../../utils/Analytics';

const ZODIAC_SIGNS = [
  {sign: 'aries', name: 'Aries', element: 'fire', dateRange: {start: '2024-03-21', end: '2024-04-19'}},
  {sign: 'taurus', name: 'Taurus', element: 'earth', dateRange: {start: '2024-04-20', end: '2024-05-20'}},
  {sign: 'gemini', name: 'Gemini', element: 'air', dateRange: {start: '2024-05-21', end: '2024-06-20'}},
  {sign: 'cancer', name: 'Cancer', element: 'water', dateRange: {start: '2024-06-21', end: '2024-07-22'}},
  {sign: 'leo', name: 'Leo', element: 'fire', dateRange: {start: '2024-07-23', end: '2024-08-22'}},
  {sign: 'virgo', name: 'Virgo', element: 'earth', dateRange: {start: '2024-08-23', end: '2024-09-22'}},
  {sign: 'libra', name: 'Libra', element: 'air', dateRange: {start: '2024-09-23', end: '2024-10-22'}},
  {sign: 'scorpio', name: 'Scorpio', element: 'water', dateRange: {start: '2024-10-23', end: '2024-11-21'}},
  {sign: 'sagittarius', name: 'Sagittarius', element: 'fire', dateRange: {start: '2024-11-22', end: '2024-12-21'}},
  {sign: 'capricorn', name: 'Capricorn', element: 'earth', dateRange: {start: '2024-12-22', end: '2025-01-19'}},
  {sign: 'aquarius', name: 'Aquarius', element: 'air', dateRange: {start: '2025-01-20', end: '2025-02-18'}},
  {sign: 'pisces', name: 'Pisces', element: 'water', dateRange: {start: '2025-02-19', end: '2025-03-20'}},
];

// Element tints the glyph, so the grid has structure beyond twelve identical tiles.
const ELEMENT_COLOR = {fire: '#C0392B', earth: '#6B8E23', air: '#4A7CA8', water: '#3E7A8C'};

export default function Horoscope({navigation}) {
  const {t} = React.useContext(LanguageContext);
  // Mounts the EN | हिं pill in the header. `apiLanguage` is threaded into the
  // request AND into the effect deps, so switching language re-fetches the
  // prediction itself — previously the chrome went Hindi while the prediction
  // text stayed English, because the app never sent ?language= at all.
  const {apiLanguage} = useFreeServiceLanguage(navigation);
  const zodiacName = (sign) => t(`zodiac.${sign}`);
  const [selected, setSelected] = useState(ZODIAC_SIGNS[0]);
  const [horoscopeData, setHoroscopeData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Re-plays whenever the sign changes, so switching sign feels like the card
  // turning over rather than text silently swapping underneath you.
  const heroAnim = useRef(new Animated.Value(0)).current;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  };

  const fetchHoroscope = async (sign) => {
    const response = await fetch(
      `${FREE_SERVICES_URL}/api/free-services/horoscope?sign=${sign}&language=${apiLanguage}`,
      {method: 'POST', headers: {'Content-Type': 'application/json'}},
    );
    return response.json();
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      heroAnim.setValue(0);
      try {
        const response = await fetchHoroscope(selected.sign);
        if (cancelled) return;
        setHoroscopeData({
          _id: selected.sign,
          zodiacSign: zodiacName(selected.sign),
          dateRange: selected.dateRange,
          prediction: response.data.daily_prediction.prediction,
          date: response.data.daily_prediction.date,
        });
        Animated.timing(heroAnim, {
          toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
      } catch (err) {
        if (cancelled) return;
        console.log(`Failed to fetch horoscope for ${selected.sign}:`, err);
        setError(t('horoscope.unableToFetch'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    // A fast tapper can outrun the network; `cancelled` stops a stale response
    // overwriting the sign they actually landed on.
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, apiLanguage]);

  const tint = ELEMENT_COLOR[selected.element] || ASTRO.maroon;

  return (
    <ScrollView style={styles.main} showsVerticalScrollIndicator={false}>
      <View style={styles.grid}>
        {ZODIAC_SIGNS.map((z, i) => {
          const on = selected.sign === z.sign;
          return (
            <Reveal key={z.sign} index={Math.floor(i / 4)} style={styles.gridCellWrap}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => { captureEvent('horoscope_sign_selected', { sign: z?.name || z?.sign || null }); setSelected(z); }}
                style={[styles.gridCell, on && styles.gridCellOn]}>
                <Text
                  style={[
                    styles.gridGlyph,
                    {color: ELEMENT_COLOR[z.element] || ASTRO.gold},
                    on && styles.gridGlyphOn,
                  ]}>
                  {ZODIAC_GLYPH[z.name]}
                </Text>
                <Text style={[styles.gridName, on && styles.gridNameOn]}>{zodiacName(z.sign)}</Text>
              </TouchableOpacity>
            </Reveal>
          );
        })}
      </View>

      <Animated.View
        style={{
          opacity: heroAnim,
          transform: [
            {translateY: heroAnim.interpolate({inputRange: [0, 1], outputRange: [16, 0]})},
          ],
        }}>
        {/* No card title/glyph here on purpose: the hero below already states the
            sign and its dates, and having both made the screen say the same thing
            twice in a row. The hero IS the header. */}
        <SectionCard>
          {loading ? (
            <View style={styles.indicator}>
              <ActivityIndicator size="small" color={ASTRO.maroon} />
            </View>
          ) : error ? (
            <Callout tone="bad" icon="alert-circle">{error}</Callout>
          ) : horoscopeData ? (
            <>
              <View style={[styles.hero, {borderColor: tint}]}>
                <Text style={[styles.heroGlyph, {color: tint}]}>{ZODIAC_GLYPH[selected.name]}</Text>
                <View style={styles.heroSide}>
                  <Text style={styles.heroName}>{horoscopeData.zodiacSign}</Text>
                  <Text style={styles.heroRange}>
                    {formatDate(selected.dateRange.start)} – {formatDate(selected.dateRange.end)}
                  </Text>
                  {!!horoscopeData.date && (
                    <View style={styles.heroDateBadge}>
                      <Text style={styles.heroDateBadgeText}>{horoscopeData.date}</Text>
                    </View>
                  )}
                </View>
              </View>
              {/* The prediction was previously behind a tap. It is the point of the
                  screen, so it reads inline; the tab view is still there for more. */}
              <Prose>{horoscopeData.prediction}</Prose>

              <TouchableOpacity
                style={styles.moreBtn}
                activeOpacity={0.85}
                onPress={() => { captureEvent('horoscope_details_opened'); navigation.navigate('HoroscopeDetails', {data: horoscopeData}); }}>
                <Text style={styles.moreBtnText}>{t('free.fullReading')}</Text>
                <Ionicons name="chevron-forward" size={moderateScale(16)} color={COLORS.white} />
              </TouchableOpacity>
            </>
          ) : null}
        </SectionCard>
      </Animated.View>

      {/* Only once a prediction is actually on screen — offering a paid
          consultation next to a spinner or an error is the wrong moment. */}
      {!loading && !error && !!horoscopeData && (
        <ConsultCta source="horoscope" style={styles.consultSpacer} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  consultSpacer: {marginBottom: verticalScale(24)},
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: scale(11), paddingTop: verticalScale(12),
  },
  gridCellWrap: {width: '25%', padding: scale(3)},
  gridCell: {
    backgroundColor: ASTRO.parchment, borderRadius: moderateScale(10), borderWidth: 1,
    borderColor: ASTRO.line, alignItems: 'center', paddingVertical: verticalScale(9),
  },
  gridCellOn: {backgroundColor: ASTRO.maroon, borderColor: ASTRO.maroon},
  gridGlyph: {fontSize: moderateScale(22)},
  gridGlyphOn: {color: ASTRO.goldSoft},
  gridName: {
    fontSize: moderateScale(9.5), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    marginTop: 2, textAlign: 'center',
  },
  gridNameOn: {color: COLORS.white},

  indicator: {paddingVertical: verticalScale(26), alignItems: 'center'},
  hero: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
    borderRadius: moderateScale(12), backgroundColor: COLORS.white,
    padding: scale(12), marginBottom: verticalScale(10),
  },
  heroGlyph: {fontSize: moderateScale(42)},
  heroSide: {flex: 1, marginLeft: scale(12)},
  heroName: {fontSize: moderateScale(18), fontFamily: 'Lato-Bold', color: ASTRO.ink},
  heroRange: {fontSize: moderateScale(11), fontFamily: 'Lato-Regular', color: ASTRO.muted, marginTop: 1},
  heroDateBadge: {
    alignSelf: 'flex-start', backgroundColor: ASTRO.goldSoft, borderRadius: 20,
    paddingHorizontal: scale(9), paddingVertical: verticalScale(2), marginTop: verticalScale(5),
  },
  heroDateBadgeText: {fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: ASTRO.maroon},

  moreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ASTRO.maroon, borderRadius: moderateScale(10),
    paddingVertical: verticalScale(11), marginTop: verticalScale(12),
  },
  moreBtnText: {
    fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: COLORS.white,
    marginRight: scale(4),
  },
});
