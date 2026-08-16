// Free Kundali Matching result.
//
// Was: three hand-rolled tabs, then two remote flaticon PNGs (a generic man, a
// generic woman and a "bond" icon) with the Guna Milan score printed as plain
// text — "19.5/36" in a coloured box, with no sense of what that is out of or
// whether it is good. The same description sentence was printed twice.
//
// Now: an animated ring for the score (the same one the paid Matching report
// uses), a side-by-side Manglik comparison, and the shared SegmentedTabs.
import React, {useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView} from 'react-native';
import {useRoute} from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import {
  ASTRO, SectionCard, SegmentedTabs, RingGauge, Callout, Badge, Divider, ConsultCta,
} from '../../../components/astro/AstroUI';
import {LanguageContext} from '../../../context/LanguageContext';
import BasicDetails from './BasicDetails';
import GunaDetails from './GunaDetails';

function Person({name, manglik, onView, glyph, t}) {
  return (
    <View style={styles.person}>
      <View style={[styles.personGlyphBox, manglik && styles.personGlyphBoxBad]}>
        <Text style={styles.personGlyph}>{glyph}</Text>
      </View>
      <Text style={styles.personName}>{name}</Text>
      <Badge text={manglik ? 'Manglik' : 'Non-Manglik'} tone={manglik ? 'bad' : 'good'} />
      <TouchableOpacity style={styles.viewBtn} onPress={onView} activeOpacity={0.85}>
        <Text style={styles.viewBtnText}>{t('kundali.showKundali')}</Text>
        <Ionicons name="chevron-forward" size={moderateScale(13)} color={ASTRO.maroon} />
      </TouchableOpacity>
    </View>
  );
}

export default function KundaliMatchingReport({navigation}) {
  const {t} = React.useContext(LanguageContext);
  const [activeTab, setActiveTab] = useState('result');
  const route = useRoute();
  const {reportData, boyName, girlName} = route.params;

  const d = reportData?.data || {};
  const got = Number(d?.guna_milan?.total_points) || 0;
  const max = Number(d?.guna_milan?.maximum_points) || 36;
  const pct = max ? Math.round((got / max) * 100) : 0;
  const tone = pct >= 70 ? 'good' : pct >= 50 ? 'warn' : 'bad';

  const tabs = [
    {key: 'result', label: t('free.result')},
    {key: 'basic', label: t('free.basicDetails')},
    {key: 'guna', label: t('free.gunaDetails')},
  ];

  const renderContent = () => {
    if (activeTab === 'basic') {
      return <BasicDetails boyInfo={d.boy_info} girlInfo={d.girl_info} />;
    }
    if (activeTab === 'guna') {
      return <GunaDetails gunaData={d?.guna_milan?.guna} />;
    }
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SectionCard
          title={t('free.matchScore')}
          glyph="❤"
          subtitle={t('report.pointByPoint')}
          index={0}>
          <View style={styles.scoreHero}>
            <RingGauge value={got} max={max} label={t('free.matchScore')} size={moderateScale(140)} />
          </View>
          {/* The description used to be printed twice — once as a subtitle and
              again inside the score box. Once, as the summary callout. */}
          {!!d?.message?.description && (
            <Callout tone={tone} icon="heart">{d.message.description}</Callout>
          )}
        </SectionCard>

        <SectionCard title={t('report.doshaComparison')} glyph="⚖" index={1}>
          <View style={styles.pair}>
            <Person
              t={t}
              glyph="♂"
              name={boyName}
              manglik={!!d?.boy_mangal_dosha_details?.has_dosha}
              onView={() => navigation.navigate('KundaliMatchingDetailsResult', {
                kundaliData: d.boy_info, name: boyName,
              })}
            />
            <View style={styles.bond}>
              <Ionicons name="heart" size={moderateScale(22)} color={ASTRO.gold} />
            </View>
            <Person
              t={t}
              glyph="♀"
              name={girlName}
              manglik={!!d?.girl_mangal_dosha_details?.has_dosha}
              onView={() => navigation.navigate('KundaliMatchingDetailsResult', {
                kundaliData: d.girl_info, name: girlName,
              })}
            />
          </View>
        </SectionCard>

        {/* Was an inline "Chat with Astrologer" button inside the score card that
            called navigate('Chat'). This screen is registered on the ROOT stack,
            which has no route by that name, and React Navigation only bubbles an
            action upward — so the button rendered correctly and did nothing.
            The shared component navigates the full nested path. */}
        <ConsultCta source="kundali_matching" />
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <SegmentedTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {/* keyed so each tab replays its entrance animation */}
      <View key={activeTab} style={styles.body}>{renderContent()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  body: {flex: 1},
  scroll: {paddingTop: verticalScale(12), paddingBottom: verticalScale(28)},
  scoreHero: {alignItems: 'center', marginBottom: verticalScale(10)},

  pair: {flexDirection: 'row', alignItems: 'center'},
  person: {flex: 1, alignItems: 'center'},
  personGlyphBox: {
    width: moderateScale(52), height: moderateScale(52), borderRadius: moderateScale(26),
    backgroundColor: ASTRO.goldSoft, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: ASTRO.gold,
  },
  personGlyphBoxBad: {backgroundColor: '#FDF0EE', borderColor: '#F3D2CC'},
  personGlyph: {fontSize: moderateScale(24), color: ASTRO.maroon},
  personName: {
    fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: ASTRO.ink,
    marginTop: verticalScale(6), marginBottom: verticalScale(4), textAlign: 'center',
  },
  viewBtn: {
    flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(7),
    borderWidth: 1, borderColor: ASTRO.line, borderRadius: 20,
    paddingHorizontal: scale(10), paddingVertical: verticalScale(4),
    backgroundColor: COLORS.white,
  },
  viewBtnText: {fontSize: moderateScale(10.5), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  bond: {paddingHorizontal: scale(8)},
  hint: {
    fontSize: moderateScale(10), fontFamily: 'Lato-Regular', color: ASTRO.muted,
    textAlign: 'center',
  },
});
