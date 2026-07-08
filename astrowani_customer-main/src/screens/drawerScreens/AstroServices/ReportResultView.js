// Generic renderer for a JyotishamAstroAPI JSON response section. The exact field names differ
// per endpoint and are only known from the docs' captured examples (not verified live against
// real responses in this build — see the "no live API calls" constraint noted during planning),
// so rather than hand-build bespoke UI that might silently mis-render on real payloads, every
// report result screen feeds its JSON sections through this recursive key/value renderer.
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';

function humanize(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ValueNode({value, depth}) {
  if (value === null || value === undefined || value === '') {
    return <Text style={styles.value}>—</Text>;
  }
  if (Array.isArray(value)) {
    return (
      <View>
        {value.map((item, i) => (
          <View key={i} style={[styles.arrayItem, {marginLeft: scale(depth * 10)}]}>
            {typeof item === 'object' && item !== null ? (
              <ObjectNode obj={item} depth={depth + 1} />
            ) : (
              <Text style={styles.value}>• {String(item)}</Text>
            )}
          </View>
        ))}
      </View>
    );
  }
  if (typeof value === 'object') {
    return <ObjectNode obj={value} depth={depth + 1} />;
  }
  return <Text style={styles.value}>{String(value)}</Text>;
}

function ObjectNode({obj, depth = 0}) {
  return (
    <View style={{marginLeft: scale(depth * 8)}}>
      {Object.entries(obj).map(([k, v]) => (
        <View key={k} style={styles.row}>
          <Text style={styles.label}>{humanize(k)}</Text>
          <ValueNode value={v} depth={depth} />
        </View>
      ))}
    </View>
  );
}

// title: section heading shown above the card. data: the JSON object/array to render.
export default function ReportResultView({title, data}) {
  if (!data) return null;
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {Array.isArray(data) || typeof data === 'object' ? (
        <ObjectNode obj={data} />
      ) : (
        <Text style={styles.value}>{String(data)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    padding: scale(14),
    marginHorizontal: scale(15),
    marginBottom: verticalScale(14),
  },
  title: {
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    marginBottom: verticalScale(8),
  },
  row: {
    marginBottom: verticalScale(6),
  },
  arrayItem: {
    marginBottom: verticalScale(4),
  },
  label: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Bold',
    color: COLORS.textDark,
  },
  value: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: COLORS.lightGrey,
    marginTop: verticalScale(1),
  },
});
