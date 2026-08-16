// Boy's / Girl's koot details for the free Kundali Matching report.
//
// Was two DetailLists of six "Label — value" rows each, stacked, with nothing
// distinguishing the two people beyond the section title, and no way to compare
// a value against its counterpart without scrolling between the lists.
//
// Now each person is a card with their own glyph, and the six koots render as
// chips — with the matching koot side by side, which is the comparison a reader
// is actually making.
import React from 'react';
import {ScrollView, StyleSheet, View, Text} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import {ASTRO, SectionCard, ZODIAC_GLYPH} from '../../../components/astro/AstroUI';
import {LanguageContext} from '../../../context/LanguageContext';

const KOOTS = [
  ['nakshatra', 'report.nakshatra'],
  ['rasi', 'report.rashi'],
  ['varna', null],
  ['vasya', null],
  ['yoni', null],
  ['gana', null],
];

function read(info, key) {
  if (key === 'nakshatra') return info?.nakshatra?.name;
  if (key === 'rasi') return info?.rasi?.name;
  return info?.koot?.[key];
}

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

export default function BasicDetails({boyInfo, girlInfo}) {
  const {t} = React.useContext(LanguageContext);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionCard title={t('free.basicDetails')} glyph="⚖" index={0}>
        <View style={styles.headRow}>
          <View style={styles.headLabel} />
          <View style={styles.headCell}>
            <Text style={styles.headGlyph}>♂</Text>
            <Text style={styles.headName}>{t('report.boy')}</Text>
          </View>
          <View style={styles.headCell}>
            <Text style={styles.headGlyph}>♀</Text>
            <Text style={styles.headName}>{t('report.girl')}</Text>
          </View>
        </View>

        {KOOTS.map(([key, labelKey], i) => {
          const b = read(boyInfo, key);
          const g = read(girlInfo, key);
          // A koot matching between the two is the favourable case, and it is the
          // thing the reader is scanning for — so say it with colour rather than
          // making them compare two strings.
          const same = b && g && String(b).toLowerCase() === String(g).toLowerCase();
          return (
            <View key={key} style={[styles.row, i % 2 ? styles.rowAlt : null]}>
              <Text style={styles.rowLabel}>{labelKey ? t(labelKey) : cap(key)}</Text>
              <View style={styles.cell}>
                <Text style={[styles.cellText, same && styles.cellMatch]}>
                  {ZODIAC_GLYPH[b] ? `${ZODIAC_GLYPH[b]} ` : ''}{b || '—'}
                </Text>
              </View>
              <View style={styles.cell}>
                <Text style={[styles.cellText, same && styles.cellMatch]}>
                  {ZODIAC_GLYPH[g] ? `${ZODIAC_GLYPH[g]} ` : ''}{g || '—'}
                </Text>
              </View>
            </View>
          );
        })}
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: ASTRO.parchmentDeep},
  content: {paddingTop: verticalScale(12), paddingBottom: verticalScale(28)},

  headRow: {
    flexDirection: 'row', alignItems: 'flex-end', paddingBottom: verticalScale(7),
    borderBottomWidth: 1.5, borderBottomColor: ASTRO.goldSoft,
  },
  headLabel: {flex: 1.2},
  headCell: {flex: 1, alignItems: 'center'},
  headGlyph: {fontSize: moderateScale(18), color: ASTRO.gold},
  headName: {
    fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(9),
    borderBottomWidth: 1, borderBottomColor: ASTRO.line,
  },
  rowAlt: {backgroundColor: '#FFFDF9'},
  rowLabel: {
    flex: 1.2, fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  cell: {
    flex: 1, alignItems: 'center', paddingHorizontal: scale(4),
  },
  cellText: {
    fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.ink, textAlign: 'center',
  },
  cellMatch: {color: ASTRO.good},
});
