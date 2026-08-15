// Domain blocks that render specific JyotishamAstroAPI payloads properly.
//
// Built against REAL captured responses (2026-08-15), which is the thing the
// original generic renderer could not do — it was written without live API
// access, so it defensively dumped every payload as label/value text.
//
// Every block is PROGRESSIVE: it checks that the shape it expects is actually
// present and falls back to a plain key/value listing when it is not. That
// keeps the original safety property (nothing silently mis-renders or crashes
// on an unexpected payload) while giving the common, known shapes real visual
// treatment.
import React from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {
  ASTRO, SectionCard, StatTile, TileRow, ScoreBar, Badge, ChipGrid, Prose,
  Divider, KeyVal, humanize, ZODIAC_GLYPH, PLANET_GLYPH,
} from './AstroUI';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/* ------------------------------------------------------------------ */
/* Generic fallback — used whenever a payload is not the expected shape */
/* ------------------------------------------------------------------ */

export function GenericKeyVals({data, depth = 0}) {
  if (data === null || data === undefined || data === '') {
    return <Text style={styles.dim}>—</Text>;
  }
  if (Array.isArray(data)) {
    return (
      <View>
        {data.map((item, i) => (
          <View key={i} style={{marginBottom: verticalScale(4)}}>
            {isObj(item) ? <GenericKeyVals data={item} depth={depth + 1} />
              : <Text style={styles.dim}>• {String(item)}</Text>}
          </View>
        ))}
      </View>
    );
  }
  if (isObj(data)) {
    return (
      <View style={{marginLeft: scale(depth * 6)}}>
        {Object.entries(data).map(([k, v]) => (
          isObj(v) || Array.isArray(v)
            ? (
              <View key={k} style={{marginBottom: verticalScale(5)}}>
                <Text style={styles.subLabel}>{humanize(k)}</Text>
                <GenericKeyVals data={v} depth={depth + 1} />
              </View>
            )
            : <KeyVal key={k} label={humanize(k)} value={v} />
        ))}
      </View>
    );
  }
  return <Text style={styles.dim}>{String(data)}</Text>;
}

/* ------------------------------------------------------------------ */
/* Planetary positions                                                  */
/* ------------------------------------------------------------------ */

// planet-details returns planets under numeric string keys ("0".."9") plus
// lucky_gem / lucky_num alongside them, so pick out only the numeric entries.
function extractPlanets(data) {
  if (!isObj(data)) return [];
  return Object.keys(data)
    .filter((k) => /^\d+$/.test(k) && isObj(data[k]))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => data[k]);
}

export function PlanetTable({data, title = 'Planetary Positions'}) {
  const planets = extractPlanets(data);
  if (!planets.length) {
    return <SectionCard title={title} glyph="☉"><GenericKeyVals data={data} /></SectionCard>;
  }
  const luckyGem = Array.isArray(data.lucky_gem) ? data.lucky_gem.join(', ') : data.lucky_gem;
  const luckyNum = Array.isArray(data.lucky_num) ? data.lucky_num.join(', ') : data.lucky_num;

  return (
    <SectionCard title={title} glyph="☉" subtitle={`${planets.length} positions at birth`}>
      {/* Horizontal scroll: the full table is wider than a phone, and truncating
          columns would drop the nakshatra/pada detail astrologers actually use. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.tr, styles.trHead]}>
            <Text style={[styles.th, styles.cPlanet]}>Planet</Text>
            <Text style={[styles.th, styles.cSign]}>Sign</Text>
            <Text style={[styles.th, styles.cNum]}>House</Text>
            <Text style={[styles.th, styles.cDeg]}>Degree</Text>
            <Text style={[styles.th, styles.cNak]}>Nakshatra</Text>
            <Text style={[styles.th, styles.cNum]}>Pada</Text>
          </View>
          {planets.map((p, i) => {
            const glyph = PLANET_GLYPH[p.full_name] || PLANET_GLYPH[p.name] || '•';
            const zGlyph = ZODIAC_GLYPH[p.zodiac] || '';
            return (
              <View key={i} style={[styles.tr, i % 2 ? styles.trAlt : null]}>
                <View style={[styles.cPlanet, styles.planetCell]}>
                  <Text style={styles.planetGlyph}>{glyph}</Text>
                  <View style={{flex: 1}}>
                    <Text style={styles.planetName} numberOfLines={1}>{p.full_name || p.name}</Text>
                    {/* Combustion and retrograde change a reading materially, so
                        they get a visible marker rather than a buried field. */}
                    {(p.is_combust || p.is_retrograde || p.retro) && (
                      <Text style={styles.planetFlag}>
                        {p.is_combust ? 'Combust' : ''}{p.is_combust && (p.is_retrograde || p.retro) ? ' · ' : ''}
                        {(p.is_retrograde || p.retro) ? 'Retrograde' : ''}
                      </Text>
                    )}
                  </View>
                </View>
                <Text style={[styles.td, styles.cSign]} numberOfLines={1}>{zGlyph} {p.zodiac || '—'}</Text>
                <Text style={[styles.td, styles.cNum]}>{p.house ?? '—'}</Text>
                <Text style={[styles.td, styles.cDeg]} numberOfLines={1}>{p.local_degree_dms || '—'}</Text>
                <Text style={[styles.td, styles.cNak]} numberOfLines={1}>{p.nakshatra || '—'}</Text>
                <Text style={[styles.td, styles.cNum]}>{p.nakshatra_pada ?? '—'}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {(luckyGem || luckyNum) && (
        <>
          <Divider />
          <TileRow>
            {!!luckyGem && <StatTile label="Lucky Gem" value={luckyGem} />}
            {!!luckyNum && <StatTile label="Lucky Number" value={luckyNum} />}
          </TileRow>
        </>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Kundli attributes + gemstones                                        */
/* ------------------------------------------------------------------ */

const STONE_KEYS = ['life_stone', 'lucky_stone', 'fortune_stone'];

export function KundliAttributes({data, title = 'Birth Attributes'}) {
  if (!isObj(data)) return null;
  const stones = STONE_KEYS.filter((k) => data[k]);
  const attrKeys = Object.keys(data).filter(
    (k) => !STONE_KEYS.includes(k) && !isObj(data[k]) && !Array.isArray(data[k]),
  );

  return (
    <SectionCard title={title} glyph="✦">
      <ChipGrid items={attrKeys.map((k) => ({label: humanize(k), value: data[k]}))} />
      {!!stones.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Recommended Stones</Text>
          <TileRow>
            {stones.map((k) => (
              <StatTile key={k} label={humanize(k)} value={String(data[k])} />
            ))}
          </TileRow>
        </>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Dosha verdict                                                        */
/* ------------------------------------------------------------------ */

export function DoshaVerdict({title, data, glyph = '⚠'}) {
  if (!isObj(data)) {
    return <SectionCard title={title} glyph={glyph}><GenericKeyVals data={data} /></SectionCard>;
  }
  const present = data.is_dosha_present;
  const hasVerdict = typeof present === 'boolean';
  if (!hasVerdict) {
    return <SectionCard title={title} glyph={glyph}><GenericKeyVals data={data} /></SectionCard>;
  }

  const partial = data.is_anshik === true;
  const tone = present ? (partial ? 'warn' : 'bad') : 'good';
  const label = present ? (partial ? 'Partially Present' : 'Present') : 'Not Present';
  const factors = isObj(data.factors) ? Object.entries(data.factors) : [];
  const remedies = Array.isArray(data.remedies) ? data.remedies : (data.remedies ? [data.remedies] : []);

  return (
    <SectionCard title={title} glyph={glyph}>
      <View style={styles.verdictRow}>
        <Badge text={label} tone={tone} />
        {data.score !== undefined && data.score !== null && (
          <Text style={styles.verdictScore}>Score {String(data.score)}</Text>
        )}
      </View>

      {typeof data.score === 'number' && (
        <View style={{marginTop: verticalScale(8)}}>
          <ScoreBar label="Dosha Intensity" value={data.score} max={100} />
        </View>
      )}

      {!!data.bot_response && <><Divider /><Prose>{String(data.bot_response)}</Prose></>}

      {!!factors.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Contributing Factors</Text>
          {factors.map(([k, v]) => (
            <Text key={k} style={styles.bullet}>• {String(v)}</Text>
          ))}
        </>
      )}

      {!!data.cancellation && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Cancellation</Text>
          <Prose>{typeof data.cancellation === 'string' ? data.cancellation : JSON.stringify(data.cancellation)}</Prose>
        </>
      )}

      {!!remedies.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Remedies</Text>
          {remedies.map((r, i) => (
            <Text key={i} style={styles.bullet}>• {typeof r === 'string' ? r : JSON.stringify(r)}</Text>
          ))}
        </>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Dasha timeline                                                       */
/* ------------------------------------------------------------------ */

export function DashaTimeline({title, periods, glyph = '⏳'}) {
  const list = Array.isArray(periods) ? periods.filter((p) => isObj(p) && p.name) : [];
  if (!list.length) {
    return <SectionCard title={title} glyph={glyph}><GenericKeyVals data={periods} /></SectionCard>;
  }
  // Highlight whichever period contains today — the single thing a reader
  // actually looks for in a dasha table.
  const now = Date.now();
  const isCurrent = (p) => {
    const s = Date.parse(p.start); const e = Date.parse(p.end);
    return !isNaN(s) && !isNaN(e) && now >= s && now <= e;
  };
  return (
    <SectionCard title={title} glyph={glyph} subtitle={`${list.length} periods`}>
      {list.map((p, i) => {
        const cur = isCurrent(p);
        return (
          <View key={i} style={[styles.period, cur && styles.periodCurrent]}>
            <View style={[styles.periodDot, cur && styles.periodDotCurrent]} />
            <View style={{flex: 1}}>
              <View style={styles.periodTop}>
                <Text style={[styles.periodName, cur && {color: ASTRO.maroon}]}>
                  {PLANET_GLYPH[p.name] ? `${PLANET_GLYPH[p.name]} ` : ''}{p.name}
                </Text>
                {cur && <Badge text="Current" tone="good" />}
              </View>
              <Text style={styles.periodDates}>{p.start} → {p.end}</Text>
            </View>
          </View>
        );
      })}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Ashtakoot / Dashakoot match breakdown                                */
/* ------------------------------------------------------------------ */

// Each koota entry looks like {name, description, full_score, <key>: score}.
// The score sits under a key matching the koota itself (varna.varna etc), so
// derive it rather than hardcoding names.
function kootaScore(key, obj) {
  if (typeof obj[key] === 'number') return obj[key];
  const numeric = Object.entries(obj).find(
    ([k, v]) => typeof v === 'number' && k !== 'full_score',
  );
  return numeric ? numeric[1] : null;
}

export function KootaBreakdown({data, title = 'Guna Milan', glyph = '❤'}) {
  if (!isObj(data)) {
    return <SectionCard title={title} glyph={glyph}><GenericKeyVals data={data} /></SectionCard>;
  }
  const kootas = Object.entries(data).filter(
    ([, v]) => isObj(v) && v.full_score !== undefined,
  );
  if (!kootas.length) {
    return <SectionCard title={title} glyph={glyph}><GenericKeyVals data={data} /></SectionCard>;
  }

  const totalMax = kootas.reduce((s, [, v]) => s + (Number(v.full_score) || 0), 0);
  const totalGot = kootas.reduce((s, [k, v]) => s + (Number(kootaScore(k, v)) || 0), 0);
  const pct = totalMax ? Math.round((totalGot / totalMax) * 100) : 0;
  const tone = pct >= 70 ? 'good' : pct >= 50 ? 'warn' : 'bad';

  return (
    <SectionCard title={title} glyph={glyph} subtitle="Ashtakoot compatibility">
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
      {kootas.map(([k, v]) => (
        <ScoreBar
          key={k}
          label={v.name || humanize(k)}
          value={kootaScore(k, v) ?? 0}
          max={v.full_score}
          caption={v.description}
        />
      ))}
      {!!data.bot_response && <><Divider /><Prose>{String(data.bot_response)}</Prose></>}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Numerology                                                           */
/* ------------------------------------------------------------------ */

export function NumerologyNumbers({data, title = 'Your Numbers', glyph = '#'}) {
  if (!isObj(data)) {
    return <SectionCard title={title} glyph={glyph}><GenericKeyVals data={data} /></SectionCard>;
  }
  const numberKeys = Object.keys(data).filter((k) => typeof data[k] === 'number');
  const planes = isObj(data.planePercentages) ? Object.entries(data.planePercentages) : [];

  return (
    <SectionCard title={title} glyph={glyph}>
      {!!numberKeys.length && (
        <TileRow>
          {numberKeys.map((k) => (
            <StatTile key={k} label={humanize(k.replace(/Number$/, ''))} value={String(data[k])} />
          ))}
        </TileRow>
      )}
      {!!planes.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Plane Strengths</Text>
          {planes.map(([k, v]) => (
            <ScoreBar key={k} label={humanize(k)} value={Number(v) || 0} max={100} />
          ))}
        </>
      )}
      {!!data.description && <><Divider /><Prose>{String(data.description)}</Prose></>}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Catch-all section, styled like the rest                              */
/* ------------------------------------------------------------------ */

export function InfoSection({title, data, glyph = '◆'}) {
  if (!data) return null;
  // A bare descriptive string reads far better as prose than as a key/value row.
  if (typeof data === 'string') {
    return <SectionCard title={title} glyph={glyph}><Prose>{data}</Prose></SectionCard>;
  }
  return (
    <SectionCard title={title} glyph={glyph}>
      <GenericKeyVals data={data} />
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  dim: {fontSize: moderateScale(12), fontFamily: 'Lato-Regular', color: ASTRO.muted},
  subLabel: {
    fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    textTransform: 'uppercase', marginBottom: verticalScale(5),
  },
  bullet: {
    fontSize: moderateScale(12), lineHeight: moderateScale(18),
    fontFamily: 'Lato-Regular', color: ASTRO.ink, marginBottom: 2,
  },

  tr: {flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(7)},
  trHead: {borderBottomWidth: 1, borderBottomColor: ASTRO.line, paddingBottom: verticalScale(5)},
  trAlt: {backgroundColor: '#FFFDF9'},
  th: {fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: ASTRO.muted, textTransform: 'uppercase'},
  td: {fontSize: moderateScale(11), fontFamily: 'Lato-Regular', color: ASTRO.ink},
  cPlanet: {width: scale(96)},
  cSign: {width: scale(88)},
  cNum: {width: scale(46), textAlign: 'center'},
  cDeg: {width: scale(80)},
  cNak: {width: scale(86)},
  planetCell: {flexDirection: 'row', alignItems: 'center'},
  planetGlyph: {fontSize: moderateScale(15), color: ASTRO.gold, marginRight: scale(5)},
  planetName: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.ink},
  planetFlag: {fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.bad},

  verdictRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  verdictScore: {fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.maroon},

  period: {flexDirection: 'row', alignItems: 'flex-start', paddingVertical: verticalScale(6)},
  periodCurrent: {backgroundColor: '#FFFDF3', borderRadius: moderateScale(8), paddingHorizontal: scale(6)},
  periodDot: {
    width: scale(8), height: scale(8), borderRadius: scale(4),
    backgroundColor: ASTRO.line, marginTop: verticalScale(5), marginRight: scale(9),
  },
  periodDotCurrent: {backgroundColor: ASTRO.good},
  periodTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  periodName: {fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.ink},
  periodDates: {fontSize: moderateScale(10), fontFamily: 'Lato-Regular', color: ASTRO.muted, marginTop: 1},
});
