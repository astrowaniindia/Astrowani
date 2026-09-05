import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {moderateScale} from '../../../utils/Scaling';
import {ASTRO, ReportShell, SectionCard, Callout} from '../../../components/astro/AstroUI';
import ZoomableChart from '../../../components/astro/ZoomableChart';
import {useReportLanguage, TranslatingOverlay} from '../../../components/astro/ReportLanguage';
import {LanguageContext} from '../../../context/LanguageContext';
import useConfirmLeaveReport from '../../../hooks/useConfirmLeaveReport';

// Divisional charts are identified by their D-number (d1, d9, …); show which one this is
// rather than an unlabelled square, since the whole point of the report is choosing a
// specific division. The one-line purpose is included because "Chaturthamsa" alone tells a
// non-astrologer nothing about what they just paid for.
//
// These live here rather than in LanguageContext because the set is closed, local to this
// one screen, and each entry is a name + gloss pair that only makes sense together.
const DIVISIONS = {
  d1: ['Lagna (Rashi)', 'The main birth chart — the whole life at a glance', 'मुख्य जन्म कुंडली — सम्पूर्ण जीवन का सार'],
  d3: ['Drekkana', 'Siblings, courage and initiative', 'भाई-बहन, साहस और पहल'],
  d4: ['Chaturthamsa', 'Property, home and inner contentment', 'संपत्ति, घर और आंतरिक संतोष'],
  d6: ['Shashtamsa', 'Health, illness and obstacles', 'स्वास्थ्य, रोग और बाधाएँ'],
  d7: ['Saptamsa', 'Children and progeny', 'संतान और वंश'],
  d8: ['Ashtamsa', 'Longevity and sudden events', 'आयु और आकस्मिक घटनाएँ'],
  d9: ['Navamsa', 'Marriage, dharma and the strength behind every planet', 'विवाह, धर्म और प्रत्येक ग्रह का बल'],
  d10: ['Dasamsa', 'Career, profession and public standing', 'करियर, व्यवसाय और सामाजिक प्रतिष्ठा'],
  d12: ['Dwadasamsa', 'Parents and ancestry', 'माता-पिता और पूर्वज'],
  d16: ['Shodasamsa', 'Vehicles, comforts and luxuries', 'वाहन, सुख और विलासिता'],
  d20: ['Vimsamsa', 'Spiritual practice and devotion', 'साधना और भक्ति'],
  d24: ['Chaturvimsamsa', 'Education and learning', 'शिक्षा और विद्या'],
  d27: ['Bhamsa', 'Overall strength and weakness', 'समग्र बल और दुर्बलता'],
  d30: ['Trimsamsa', 'Misfortune and moral character', 'कष्ट और चरित्र'],
  d40: ['Khavedamsa', 'Maternal legacy and auspiciousness', 'मातृ पक्ष और शुभत्व'],
  d45: ['Akshavedamsa', 'Paternal legacy and conduct', 'पितृ पक्ष और आचरण'],
  d60: ['Shashtiamsa', 'Past-life karma — the finest division', 'पूर्व जन्म का कर्म — सूक्ष्मतम वर्ग'],
  sun: ['Sun Chart', 'The chart cast from the Sun', 'सूर्य से बनाई गई कुंडली'],
  moon: ['Moon Chart', 'The chart cast from the Moon', 'चंद्र से बनाई गई कुंडली'],
  bhav_chalit_chart: ['Bhav Chalit', 'True house positions of the planets', 'ग्रहों की वास्तविक भाव स्थिति'],
  transit_chart: ['Transit', 'Where the planets are today', 'आज ग्रह कहाँ हैं'],
};

export default function ChartResultScreen({route, navigation}) {
  const {t, language} = React.useContext(LanguageContext);
  const {data, busy} = useReportLanguage(route, navigation);
  // Paid content: confirm before a reflex back-press throws it away.
  useConfirmLeaveReport(navigation, !busy);

  const div = String(data?.division || '').toLowerCase();
  const entry = DIVISIONS[div];
  const name = entry ? entry[0] : (div ? div.toUpperCase() : 'Chart');
  const purpose = entry ? (language === 'Hindi' ? entry[2] : entry[1]) : null;

  return (
    <View style={styles.main}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ReportShell
          title={name}
          subtitle={div ? t('report.divisionalChart', {div: div.toUpperCase()}) : undefined}>
          <SectionCard title={name} glyph="✧" subtitle={div ? div.toUpperCase() : undefined} index={0}>
            {!!purpose && <Callout icon="sparkles">{purpose}</Callout>}
            {data?.chartSvg ? (
              <ZoomableChart svg={data.chartSvg} title={name} />
            ) : (
              <Text style={styles.empty}>{t('report.chartFailed')}</Text>
            )}
          </SectionCard>
        </ReportShell>
      </ScrollView>
      <TranslatingOverlay visible={busy} label={t('report.translating')} />
    </View>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  empty: {fontSize: moderateScale(12), fontFamily: 'Lato-Regular', color: ASTRO.muted},
});
