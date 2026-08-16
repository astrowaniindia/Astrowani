// Shubh Muhurat — auspicious timing tabs.
//
// The tab row was a FlatList of hand-styled chips on a white ground, with the
// active one distinguished only by a background colour that matched nothing else
// in the app. Now the shared animated SegmentedTabs (scrollable, since four tabs
// do not fit as fixed quarters) on the same parchment as the reports.
import React, {useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {ASTRO, SegmentedTabs} from '../../../components/astro/AstroUI';
import {LanguageContext} from '../../../context/LanguageContext';
import MuhuratCard from '../../component/MuhuratCard';

// `key` is the string MuhuratCard switches on to pick its endpoint — it must stay
// English regardless of display language, so the label is translated separately.
const TABS = [
  {key: 'Day Choghadiya', labelKey: 'free.choghadiya'},
  {key: 'Day Hora', labelKey: 'free.shubhHora'},
  {key: 'Gowri Panchangam', labelKey: 'free.gowriPanchangam'},
  {key: 'Rahu Kaal', labelKey: 'free.rahuKaal'},
];

export default function ShubhMuhurat() {
  const {t} = React.useContext(LanguageContext);
  const [active, setActive] = useState(TABS[0].key);

  return (
    <View style={styles.main}>
      <SegmentedTabs
        scrollable
        tabs={TABS.map((tb) => ({key: tb.key, label: t(tb.labelKey)}))}
        active={active}
        onChange={setActive}
      />
      {/* keyed so switching tabs replays the row entrance animation and resets
          MuhuratCard's own fetch state instead of showing the previous tab's rows */}
      <MuhuratCard key={active} title={active} />
    </View>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
});
