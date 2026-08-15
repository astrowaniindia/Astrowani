// Shared label/value list used by six free-service screens (Panchang, Kundali
// details, Guna/matching reports, Shubh Muhurat, Basic details).
//
// Restyled onto the same parchment/maroon/gold language as the paid reports
// (components/astro/AstroUI). It previously used a light-turquoise header that
// matched nothing else in the app and a flat bordered list, which is what made
// the free services look unfinished next to the rest of the product.
//
// Deliberately kept as a drop-in: same {title, data:[{label,value,extra}]} API,
// so all six callers get the new look with no changes of their own. It also now
// tolerates an empty/missing `data` array, which previously threw
// (`data.map` on undefined) whenever a section had nothing to show.
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import {ASTRO} from '../../components/astro/AstroUI';

const DetailList = ({title, data, glyph}) => {
  const rows = Array.isArray(data) ? data : [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {!!glyph && <Text style={styles.glyph}>{glyph}</Text>}
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      <View style={styles.body}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>No details available.</Text>
        ) : (
          rows.map((item, index) => (
            <View
              key={index}
              style={[styles.row, index === rows.length - 1 && styles.rowLast]}>
              <Text style={styles.label}>{item.label}</Text>
              <View style={styles.valueWrap}>
                <Text style={styles.value}>{item.value ?? '—'}</Text>
                {!!item.extra && <Text style={styles.extra}>{item.extra}</Text>}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
};

export default DetailList;

const styles = StyleSheet.create({
  card: {
    backgroundColor: ASTRO.parchment,
    borderRadius: moderateScale(14),
    borderWidth: 1,
    borderColor: ASTRO.line,
    marginHorizontal: scale(14),
    marginBottom: verticalScale(14),
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ASTRO.parchmentDeep,
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(9),
    borderBottomWidth: 1,
    borderBottomColor: ASTRO.line,
  },
  glyph: {fontSize: moderateScale(16), color: ASTRO.gold, marginRight: scale(8)},
  headerTitle: {
    flex: 1,
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
    color: ASTRO.maroon,
  },
  body: {paddingHorizontal: scale(12), paddingVertical: verticalScale(4)},
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: verticalScale(9),
    borderBottomWidth: 1,
    borderBottomColor: ASTRO.line,
  },
  rowLast: {borderBottomWidth: 0},
  label: {
    width: scale(104),
    fontFamily: 'Lato-Bold',
    color: ASTRO.muted,
    fontSize: moderateScale(11),
    textTransform: 'uppercase',
    paddingRight: scale(8),
  },
  valueWrap: {flex: 1},
  value: {
    fontFamily: 'Lato-Bold',
    color: ASTRO.ink,
    fontSize: moderateScale(13),
  },
  extra: {
    fontFamily: 'Lato-Regular',
    color: ASTRO.muted,
    fontSize: moderateScale(11),
    marginTop: 2,
  },
  empty: {
    fontFamily: 'Lato-Regular',
    color: ASTRO.muted,
    fontSize: moderateScale(12),
    paddingVertical: verticalScale(10),
  },
});
