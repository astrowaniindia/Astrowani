// Daily / Monthly / Yearly horoscope tabs.
//
// The tab row was three hand-rolled TouchableOpacitys with a border-radius pill
// that jumped between them with no transition, on a plain white ground that
// matched nothing else. Replaced with the shared animated SegmentedTabs so this
// screen, Shubh Muhurat and Kundali Matching all behave the same way.
import React, {useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {ASTRO, SegmentedTabs} from '../../../components/astro/AstroUI';
import {LanguageContext} from '../../../context/LanguageContext';
import HoroscopeCard from '../../component/HoroscopeCard';

export default function HoroscopeDetails({route}) {
  const {t} = React.useContext(LanguageContext);
  const [tab, setTab] = useState('daily');
  const {data} = route.params;

  const tabs = [
    {key: 'daily', label: t('free.daily')},
    {key: 'monthly', label: t('free.monthly')},
    {key: 'yearly', label: t('free.yearly')},
  ];

  return (
    <View style={styles.container}>
      <SegmentedTabs tabs={tabs} active={tab} onChange={setTab} />
      {/* keyed on the tab so the card's entrance animation replays on every switch */}
      <HoroscopeCard key={tab} data={data} tab={tab} daily={tab === 'daily'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
});
