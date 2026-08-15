// Guna Milan breakdown for the free Kundali Matching report.
//
// Was a three-column text list ("Varna  1/1  spiritual compatibility") with a
// light-turquoise header that matched nothing else in the app. The data is a
// score against a maximum — the natural encoding is a bar, which is what the
// paid Matching report now uses (components/astro/AstroBlocks KootaBreakdown).
// This renders the same way so the free and paid matching reports look like one
// product, and adds the total/percentage the old version never computed.
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {scale, verticalScale} from '../../../utils/Scaling';
import {
  ASTRO, SectionCard, ScoreBar, StatTile, TileRow, Divider,
} from '../../../components/astro/AstroUI';

const GunaDetails = ({gunaData}) => {
  const rows = Array.isArray(gunaData) ? gunaData : [];

  const totalGot = rows.reduce((s, g) => s + (Number(g.obtained_points) || 0), 0);
  const totalMax = rows.reduce((s, g) => s + (Number(g.maximum_points) || 0), 0);
  const pct = totalMax ? Math.round((totalGot / totalMax) * 100) : 0;
  const tone = pct >= 70 ? 'good' : pct >= 50 ? 'warn' : 'bad';

  return (
    <View style={styles.container}>
      <SectionCard title="Guna Milan" glyph="❤" subtitle="Ashtakoot compatibility">
        {totalMax > 0 && (
          <>
            <TileRow>
              <StatTile label="Total Score" value={`${totalGot}/${totalMax}`} tone={tone} />
              <StatTile label="Compatibility" value={`${pct}%`} tone={tone} />
              <StatTile
                label="Verdict"
                value={pct >= 70 ? 'Excellent' : pct >= 50 ? 'Average' : 'Low'}
                tone={tone}
              />
            </TileRow>
            <Divider />
          </>
        )}

        {rows.map((g, i) => (
          <ScoreBar
            key={g.id ?? i}
            label={g.name}
            value={Number(g.obtained_points) || 0}
            max={Number(g.maximum_points) || 0}
            caption={g.description}
          />
        ))}
      </SectionCard>
    </View>
  );
};

export default GunaDetails;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ASTRO.parchmentDeep,
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(20),
    marginHorizontal: -scale(0),
  },
});
