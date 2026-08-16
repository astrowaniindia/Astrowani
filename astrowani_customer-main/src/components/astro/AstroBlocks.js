// Domain blocks that render specific JyotishamAstroAPI payloads properly.
//
// Built against REAL captured responses (re-captured live 2026-08-16 across all
// 22 endpoints these reports use), which is the thing the original generic
// renderer could not do — it was written without live API access, so it
// defensively dumped every payload as label/value text.
//
// The 2026-08-16 pass replaced the remaining dumps. What was still wrong after
// the first pass, and what each fix is:
//
//   * PARALLEL ARRAYS WERE PRINTED SIDE BY SIDE. /dasha/mahadasha returns
//     {mahadasha:[9 names], mahadasha_order:[9 dates]} and yogini returns
//     {dasha_list, dasha_end_dates, dasha_lord_list} — three separate arrays
//     describing ONE sequence. Printed independently you got a list of 24 bare
//     planet names, then a list of 24 bare dates, with no way to tell which
//     went with which. They are now ZIPPED into one timeline.
//   * BOOLEAN PAIRS READ AS "false / false". The matching report is full of
//     {boy, girl} booleans; rendered literally they say nothing. Now CompareRow.
//   * REMEDIES BURIED EVERYTHING. Ten multi-line remedies per dosha, printed as
//     bullets, meant a reader scrolled past four screens of prose to reach the
//     next section. Now collapsed behind a labelled count.
//   * GRIDS WERE PRINTED AS LISTS. The Lo Shu grid IS a 3x3 square and Lal Kitab
//     houses ARE a 12-house chart; both were emitted as flat key/value rows.
//
// Every block stays PROGRESSIVE: it checks that the shape it expects is present
// and falls back to a plain key/value listing when it is not, so an upstream
// payload change can never make a paid report crash or come up blank.
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {
  ASTRO, SectionCard, StatTile, TileRow, ScoreBar, Badge, ChipGrid, Prose,
  Divider, KeyVal, humanize, ZODIAC_GLYPH, PLANET_GLYPH,
  RingGauge, Collapsible, NumberedList, CompareRow, CompareHeader, Callout, PillRow,
} from './AstroUI';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isBlank = (v) => v === undefined || v === null || v === '' || v === '-';

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
  if (Array.isArray(data)) return data.filter(isObj);
  if (!isObj(data)) return [];
  if (Array.isArray(data.planets)) return data.planets.filter(isObj);
  return Object.keys(data)
    .filter((k) => /^\d+$/.test(k) && isObj(data[k]))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => data[k]);
}

/**
 * Planet positions as CARDS, not a spreadsheet.
 *
 * The previous version was a six-column table inside a horizontal ScrollView.
 * On a phone that means half the columns are off-screen at any moment and the
 * reader has to scrub sideways per row to assemble one planet's story — the
 * user specifically called the sideways table out. One card per planet fits the
 * screen, keeps a planet's facts together, and makes retrograde/combust
 * impossible to miss.
 */
export function PlanetTable({data, title = 'Planetary Positions', index = 0}) {
  const planets = extractPlanets(data);
  if (!planets.length) {
    return <SectionCard title={title} glyph="☉" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const luckyGem = Array.isArray(data?.lucky_gem) ? data.lucky_gem.join(', ') : data?.lucky_gem;
  const luckyNum = Array.isArray(data?.lucky_num) ? data.lucky_num.join(', ') : data?.lucky_num;

  return (
    <SectionCard title={title} glyph="☉" subtitle={`${planets.length} positions at birth`} index={index}>
      {planets.map((p, i) => {
        const name = p.full_name || p.name || p.planet || '—';
        const glyph = PLANET_GLYPH[name] || PLANET_GLYPH[p.name] || '•';
        const zGlyph = ZODIAC_GLYPH[p.zodiac || p.sign] || '';
        const retro = p.is_retrograde || p.retro;
        const combust = p.is_combust;
        return (
          <View key={i} style={styles.pCard}>
            <View style={styles.pHead}>
              <View style={styles.pGlyphBox}>
                <Text style={styles.pGlyph}>{glyph}</Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.pName}>{name}</Text>
                <Text style={styles.pSign}>
                  {zGlyph ? `${zGlyph} ` : ''}{p.zodiac || p.sign || '—'}
                  {p.house ? `  ·  House ${p.house}` : ''}
                </Text>
              </View>
              {/* Combustion and retrogression change a reading materially, so
                  they get a visible marker rather than a buried field. */}
              <View style={styles.pFlags}>
                {!!retro && <View style={styles.flagBad}><Text style={styles.flagBadText}>℞ Retro</Text></View>}
                {!!combust && <View style={styles.flagWarn}><Text style={styles.flagWarnText}>Combust</Text></View>}
              </View>
            </View>
            <View style={styles.pGrid}>
              {!isBlank(p.local_degree_dms || p.longitude_dms) && (
                <PMini label="Degree" value={p.local_degree_dms || p.longitude_dms} />
              )}
              {!isBlank(p.nakshatra) && <PMini label="Nakshatra" value={p.nakshatra} />}
              {!isBlank(p.nakshatra_pada) && <PMini label="Pada" value={p.nakshatra_pada} />}
              {!isBlank(p.nakshatra_lord || p.nakshatraLord) && (
                <PMini label="Nak. Lord" value={p.nakshatra_lord || p.nakshatraLord} />
              )}
              {!isBlank(p.signLord) && <PMini label="Sign Lord" value={p.signLord} />}
              {!isBlank(p.subLord) && <PMini label="Sub Lord" value={p.subLord} />}
              {!isBlank(p.subSubLord) && <PMini label="Sub-sub Lord" value={p.subSubLord} />}
              {!isBlank(p.position) && <PMini label="Position" value={p.position} />}
              {!isBlank(p.nature) && <PMini label="Nature" value={p.nature} />}
              {!isBlank(p.rashi) && <PMini label="Rashi" value={p.rashi} />}
            </View>
          </View>
        );
      })}

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

function PMini({label, value}) {
  return (
    <View style={styles.pMini}>
      <Text style={styles.pMiniLabel}>{label}</Text>
      <Text style={styles.pMiniValue} numberOfLines={1}>{String(value)}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Kundli attributes + gemstones                                        */
/* ------------------------------------------------------------------ */

const STONE_KEYS = ['life_stone', 'lucky_stone', 'fortune_stone'];
const STONE_ICON = {life_stone: '◆', lucky_stone: '★', fortune_stone: '✦'};

export function KundliAttributes({data, title = 'Birth Attributes', index = 0}) {
  if (!isObj(data)) return null;
  const stones = STONE_KEYS.filter((k) => data[k]);
  const attrKeys = Object.keys(data).filter(
    (k) => !STONE_KEYS.includes(k) && !isObj(data[k]) && !Array.isArray(data[k]),
  );

  // The sign/nakshatra trio is the headline of a kundli — lift it out of the
  // chip soup so the reader sees their placements before the fine detail.
  const headline = [
    {label: 'Ascendant', value: data.ascendant_sign, glyph: ZODIAC_GLYPH[data.ascendant_sign] || '↑'},
    {label: 'Moon Sign', value: data.rasi, glyph: ZODIAC_GLYPH[data.rasi] || '☽'},
    {label: 'Sun Sign', value: data.sun_sign, glyph: ZODIAC_GLYPH[data.sun_sign] || '☉'},
  ].filter((h) => h.value);

  const rest = attrKeys.filter(
    (k) => !['ascendant_sign', 'rasi', 'sun_sign'].includes(k),
  );

  return (
    <SectionCard title={title} glyph="✦" index={index}>
      {!!headline.length && (
        <View style={styles.signRow}>
          {headline.map((h) => (
            <View key={h.label} style={styles.signCard}>
              <Text style={styles.signGlyph}>{h.glyph}</Text>
              <Text style={styles.signValue} numberOfLines={1}>{h.value}</Text>
              <Text style={styles.signLabel}>{h.label}</Text>
            </View>
          ))}
        </View>
      )}
      {!!rest.length && (
        <>
          {!!headline.length && <Divider />}
          <ChipGrid items={rest.map((k) => ({label: humanize(k), value: data[k]}))} />
        </>
      )}
      {!!stones.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Recommended Stones</Text>
          <View style={styles.stoneRow}>
            {stones.map((k) => (
              <View key={k} style={styles.stone}>
                <Text style={styles.stoneGlyph}>{STONE_ICON[k]}</Text>
                <Text style={styles.stoneValue}>{String(data[k])}</Text>
                <Text style={styles.stoneLabel}>{humanize(k).replace(' Stone', '')}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Dosha verdict                                                        */
/* ------------------------------------------------------------------ */

/**
 * A dosha report answers one question: do I have it, and how badly. That answer
 * now leads — a ring gauge and a verdict badge — with the ten-paragraph remedy
 * list folded away behind a count underneath it.
 */
export function DoshaVerdict({title, data, glyph = '⚠', index = 0}) {
  if (!isObj(data)) {
    return <SectionCard title={title} glyph={glyph} index={index}><GenericKeyVals data={data} /></SectionCard>;
  }

  const remedies = Array.isArray(data.remedies) ? data.remedies.filter(Boolean)
    : (data.remedies ? [data.remedies] : []);
  const effects = Array.isArray(data.effects) ? data.effects.filter(Boolean) : [];
  const aspects = Array.isArray(data.aspects) ? data.aspects.filter(Boolean) : [];
  const factors = Array.isArray(data.factors) ? data.factors
    : isObj(data.factors) ? Object.values(data.factors) : [];

  // /dosha/manglik-dosh has NO is_dosha_present — it reports three independent
  // sources (mars / saturn / rahu-ketu) plus a score. Derive the verdict from
  // those rather than falling through to a key/value dump, which is what the
  // screenshot of "Manglikdosh Saturn Points / Boy false / Girl false" was.
  const sources = [
    {key: 'manglik_by_mars', label: 'By Mars', glyph: '♂'},
    {key: 'manglik_by_saturn', label: 'By Saturn', glyph: '♄'},
    {key: 'manglik_by_rahuketu', label: 'By Rahu/Ketu', glyph: '☊'},
  ].filter((s) => typeof data[s.key] === 'boolean');

  const present = typeof data.is_dosha_present === 'boolean'
    ? data.is_dosha_present
    : sources.length ? sources.some((s) => data[s.key]) : null;

  if (present === null && !sources.length) {
    return <SectionCard title={title} glyph={glyph} index={index}><GenericKeyVals data={data} /></SectionCard>;
  }

  const partial = data.is_anshik === true;
  const tone = present ? (partial ? 'warn' : 'bad') : 'good';
  const label = present ? (partial ? 'Partially Present' : 'Present') : 'Not Present';
  const hasScore = typeof data.score === 'number';

  return (
    <SectionCard title={title} glyph={glyph} index={index}>
      <View style={styles.verdictHero}>
        {hasScore ? (
          <RingGauge
            value={data.score}
            max={100}
            label="Intensity"
            size={moderateScale(112)}
            tone={present ? (partial ? ASTRO.warn : ASTRO.bad) : ASTRO.good}
          />
        ) : (
          <View style={styles.verdictIconBox}>
            <Ionicons
              name={present ? 'alert-circle' : 'shield-checkmark'}
              size={moderateScale(56)}
              color={present ? ASTRO.bad : ASTRO.good}
            />
          </View>
        )}
        <View style={styles.verdictSide}>
          <Badge text={label} tone={tone} />
          {!!data.bot_response && (
            <Text style={styles.verdictLine}>{String(data.bot_response)}</Text>
          )}
        </View>
      </View>

      {!!sources.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Sources</Text>
          <View style={styles.srcRow}>
            {sources.map((s) => (
              <View
                key={s.key}
                style={[styles.src, data[s.key] ? styles.srcOn : styles.srcOff]}>
                <Text style={[styles.srcGlyph, {color: data[s.key] ? ASTRO.bad : ASTRO.muted}]}>
                  {s.glyph}
                </Text>
                <Text style={[styles.srcLabel, {color: data[s.key] ? ASTRO.bad : ASTRO.muted}]}>
                  {s.label}
                </Text>
                <Ionicons
                  name={data[s.key] ? 'close-circle' : 'checkmark-circle'}
                  size={moderateScale(13)}
                  color={data[s.key] ? ASTRO.bad : ASTRO.good}
                />
              </View>
            ))}
          </View>
        </>
      )}

      {!!factors.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Why</Text>
          {factors.map((f, i) => (
            <Callout key={i} tone="warn" icon="information-circle">{String(f)}</Callout>
          ))}
        </>
      )}

      {!!aspects.length && (
        <>
          <Text style={styles.subLabel}>Aspects</Text>
          <NumberedList items={aspects} tone="maroon" />
        </>
      )}

      {isObj(data.cancellation) && Number(data.cancellation.cancellationScore) > 0 && (
        <>
          <Divider />
          <Callout tone="good" icon="shield-checkmark">
            {`Cancellation score ${data.cancellation.cancellationScore}` +
              (Array.isArray(data.cancellation.cancellationReason) && data.cancellation.cancellationReason.length
                ? ` — ${data.cancellation.cancellationReason.join('; ')}`
                : '')}
          </Callout>
        </>
      )}

      {!!effects.length && (
        <Collapsible title="Effects" count={effects.length} glyph="◈">
          <NumberedList items={effects} tone="maroon" />
        </Collapsible>
      )}

      {!!remedies.length && (
        <>
          <Divider />
          <Collapsible title="Remedies" count={remedies.length} glyph="✚">
            <NumberedList items={remedies} />
          </Collapsible>
        </>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Dasha timeline                                                       */
/* ------------------------------------------------------------------ */

const MAX_VISIBLE_PERIODS = 6;

/**
 * Normalise every dasha shape this API emits into one [{name, start, end, lord}].
 *
 * Three genuinely different shapes come back:
 *   current-mahadasha-full → [{name, start, end}]                  (already fine)
 *   mahadasha              → {mahadasha:[names], mahadasha_order:[start dates]}
 *   yogini-dasha-*         → {dasha_list, dasha_end_dates, dasha_lord_list}
 * The last two are parallel arrays; index i of each describes ONE period. Printing
 * them as separate lists — which is what the shipped app did — destroys the
 * pairing that is the entire content of a dasha table.
 */
function normalizePeriods(input) {
  if (Array.isArray(input) && input.some((p) => isObj(p) && p.name)) {
    return input.filter((p) => isObj(p) && p.name);
  }
  if (!isObj(input)) return [];

  if (Array.isArray(input.mahadasha) && Array.isArray(input.mahadasha_order)) {
    const names = input.mahadasha;
    const starts = input.mahadasha_order;
    return names.map((name, i) => ({
      name,
      start: starts[i],
      // Each period runs up to the next one's start; the last has no successor.
      end: starts[i + 1],
    }));
  }

  if (Array.isArray(input.dasha_list) && Array.isArray(input.dasha_end_dates)) {
    const names = input.dasha_list;
    const ends = input.dasha_end_dates;
    const lords = Array.isArray(input.dasha_lord_list) ? input.dasha_lord_list : [];
    return names.map((name, i) => ({
      name,
      // First period starts at birth (no earlier end date exists to borrow).
      start: i === 0 ? undefined : ends[i - 1],
      end: ends[i],
      lord: lords[i],
    }));
  }
  return [];
}

// The API mixes "Sat 31 Oct 1998" and "Mon, May 27, 2002, 12:00:00 AM".
// Date.parse handles both once the leading weekday is dropped.
function parseDate(s) {
  if (!s) return NaN;
  const t = Date.parse(String(s).replace(/^[A-Za-z]{3},?\s*/, ''));
  return isNaN(t) ? NaN : t;
}

function shortDate(s) {
  const t = parseDate(s);
  if (isNaN(t)) return s || '—';
  const d = new Date(t);
  return `${d.getDate()} ${d.toLocaleString('en', {month: 'short'})} ${d.getFullYear()}`;
}

export function DashaTimeline({title, periods, glyph = '⏳', subtitle, index = 0}) {
  const list = normalizePeriods(periods);
  if (!list.length) {
    if (!periods) return null;
    return <SectionCard title={title} glyph={glyph} index={index}><GenericKeyVals data={periods} /></SectionCard>;
  }

  const now = Date.now();
  const currentIdx = list.findIndex((p) => {
    const s = parseDate(p.start);
    const e = parseDate(p.end);
    if (!isNaN(s) && !isNaN(e)) return now >= s && now <= e;
    // Yogini's first period has no explicit start — it runs from birth to its end.
    if (isNaN(s) && !isNaN(e)) return now <= e;
    return false;
  });

  // Longest period sets the bar scale, so relative duration is readable at a
  // glance — a 20-year Venus mahadasha should visibly dwarf a 6-year Sun.
  const spans = list.map((p) => {
    const s = parseDate(p.start);
    const e = parseDate(p.end);
    return !isNaN(s) && !isNaN(e) && e > s ? e - s : 0;
  });
  const maxSpan = Math.max(...spans, 1);

  const current = currentIdx >= 0 ? list[currentIdx] : null;
  // Start the visible window at the current period — nobody opens a dasha report
  // to read about 1998. Everything else stays one tap away.
  const startAt = currentIdx > 0 ? currentIdx : 0;
  const head = list.slice(startAt, startAt + MAX_VISIBLE_PERIODS);
  const before = list.slice(0, startAt);
  const after = list.slice(startAt + MAX_VISIBLE_PERIODS);

  const row = (p, i, absoluteIdx) => {
    const cur = absoluteIdx === currentIdx;
    const span = spans[absoluteIdx];
    const years = span ? span / (365.25 * 24 * 3600 * 1000) : 0;
    return (
      <View key={absoluteIdx} style={[styles.period, cur && styles.periodCurrent]}>
        <View style={styles.periodRail}>
          <View style={[styles.periodDot, cur && styles.periodDotCurrent]} />
          {i < head.length - 1 && <View style={styles.periodLine} />}
        </View>
        <View style={{flex: 1}}>
          <View style={styles.periodTop}>
            <Text style={[styles.periodName, cur && {color: ASTRO.maroon}]}>
              {PLANET_GLYPH[p.name] ? `${PLANET_GLYPH[p.name]} ` : ''}{p.name}
              {p.lord && p.lord !== p.name ? <Text style={styles.periodLord}>  ({p.lord})</Text> : null}
            </Text>
            {cur && <Badge text="Now" tone="good" />}
          </View>
          <Text style={styles.periodDates}>
            {/* Yogini's first period has no start date of its own — it runs from
                birth, which is more useful to say than an em dash. */}
            {p.start ? shortDate(p.start) : 'Birth'} → {shortDate(p.end)}
            {years >= 0.1 ? `  ·  ${years < 1 ? `${Math.round(years * 12)} mo` : `${years.toFixed(years < 10 ? 1 : 0)} yr`}` : ''}
          </Text>
          {span > 0 && (
            <View style={styles.spanTrack}>
              <View
                style={[
                  styles.spanFill,
                  {width: `${Math.max(4, (span / maxSpan) * 100)}%`,
                    backgroundColor: cur ? ASTRO.good : ASTRO.goldSoft},
                ]}
              />
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SectionCard
      title={title}
      glyph={glyph}
      subtitle={subtitle || `${list.length} periods`}
      index={index}>
      {!!current && (
        <Callout tone="good" icon="time">
          {`Currently running: ${current.name}${current.lord && current.lord !== current.name ? ` (${current.lord})` : ''} — until ${shortDate(current.end)}`}
        </Callout>
      )}

      {!!before.length && (
        <Collapsible title="Earlier periods" count={before.length} glyph="↑">
          {before.map((p, i) => row(p, i, i))}
        </Collapsible>
      )}

      {head.map((p, i) => row(p, i, startAt + i))}

      {!!after.length && (
        <Collapsible title="Later periods" count={after.length} glyph="↓">
          {after.map((p, i) => row(p, i, startAt + head.length + i))}
        </Collapsible>
      )}
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

export function KootaBreakdown({data, title = 'Guna Milan', glyph = '❤', index = 0}) {
  if (!isObj(data)) {
    return <SectionCard title={title} glyph={glyph} index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const kootas = Object.entries(data).filter(
    ([, v]) => isObj(v) && v.full_score !== undefined,
  );
  if (!kootas.length) {
    return <SectionCard title={title} glyph={glyph} index={index}><GenericKeyVals data={data} /></SectionCard>;
  }

  const totalMax = kootas.reduce((s, [, v]) => s + (Number(v.full_score) || 0), 0);
  const totalGot = kootas.reduce((s, [k, v]) => s + (Number(kootaScore(k, v)) || 0), 0);
  const pct = totalMax ? Math.round((totalGot / totalMax) * 100) : 0;
  const tone = pct >= 70 ? 'good' : pct >= 50 ? 'warn' : 'bad';

  return (
    <SectionCard title={title} glyph={glyph} subtitle="Point-by-point compatibility" index={index}>
      <View style={styles.kootaHero}>
        <RingGauge value={totalGot} max={totalMax} label="Total Guna" />
        <View style={styles.kootaHeroSide}>
          <StatTile label="Compatibility" value={`${pct}%`} tone={tone} />
          <View style={{height: verticalScale(6)}} />
          <StatTile
            label="Verdict"
            value={pct >= 70 ? 'Excellent' : pct >= 50 ? 'Average' : 'Low'}
            tone={tone}
          />
        </View>
      </View>

      {!!data.bot_response && <Callout tone={tone}>{String(data.bot_response)}</Callout>}

      <Divider />
      {kootas.map(([k, v], i) => {
        // Each koota also carries the two people's own values (boy_varna /
        // girl_varna). Showing them makes the score explicable instead of arbitrary.
        const boy = v[`boy_${k}`];
        const girl = v[`girl_${k}`];
        return (
          <View key={k}>
            <ScoreBar
              label={v.name || humanize(k)}
              value={kootaScore(k, v) ?? 0}
              max={v.full_score}
              caption={v.description}
              index={i}
            />
            {(!isBlank(boy) || !isBlank(girl)) && (
              <Text style={styles.kootaPair}>
                ♂ {isBlank(boy) ? '—' : String(boy)}   ·   ♀ {isBlank(girl) ? '—' : String(girl)}
              </Text>
            )}
          </View>
        );
      })}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Aggregate match — the overall verdict screen                         */
/* ------------------------------------------------------------------ */

// {boy, girl} pairs in the aggregate payload, with the plain-language sentence
// that goes with each. `invert` marks the ones where true = a dosha is present.
const AGG_DOSHAS = [
  {points: 'mangaldosh_points', text: 'mangaldosh', label: 'Mangal Dosha', invert: true},
  {points: 'pitradosh_points', text: 'pitradosh', label: 'Pitra Dosha', invert: true},
  {points: 'kaalsarp_points', text: 'kaalsarpdosh', label: 'Kaal Sarp Dosha', invert: true},
  {points: 'manglikdosh_saturn_points', text: 'manglikdosh_saturn', label: 'Manglik by Saturn', invert: true},
  {points: 'manglikdosh_rahuketu_points', text: 'manglikdosh_rahuketu', label: 'Manglik by Rahu/Ketu', invert: true},
];

/**
 * The overall compatibility verdict. This payload was the single worst offender
 * in the shipped app: a flat dump where "MANGLIKDOSH SATURN POINTS / Boy false /
 * Girl false" appeared five times over, and the score the reader actually came
 * for was one unremarkable row among thirty.
 */
export function AggregateMatch({data, title = 'Overall Compatibility', index = 0}) {
  if (!isObj(data) || data.score === undefined) {
    return <SectionCard title={title} glyph="∑" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const score = Number(data.score) || 0;
  const tone = score >= 70 ? 'good' : score >= 50 ? 'warn' : 'bad';
  const rows = AGG_DOSHAS.filter((d) => isObj(data[d.points]));
  const explanations = AGG_DOSHAS
    .filter((d) => typeof data[d.text] === 'string' && data[d.text])
    .map((d) => ({label: d.label, text: data[d.text]}));

  return (
    <SectionCard title={title} glyph="∑" subtitle="Everything weighed together" index={index}>
      <View style={styles.aggHero}>
        <RingGauge value={score} max={100} label="Match Score" size={moderateScale(140)} />
      </View>

      {!!data.bot_response && <Callout tone={tone} icon="heart">{String(data.bot_response)}</Callout>}

      {(data.ashtakoot !== undefined || data.dashkoot !== undefined) && (
        <>
          <Divider />
          {data.ashtakoot !== undefined && (
            <ScoreBar label="Ashtakoot" value={data.ashtakoot} max={36} index={0} />
          )}
          {data.dashkoot !== undefined && (
            <ScoreBar label="Dashakoot" value={data.dashkoot} max={10} index={1} />
          )}
        </>
      )}

      {(typeof data.rajjudosh === 'boolean' || typeof data.vedhadosh === 'boolean') && (
        <View style={styles.flagPairRow}>
          {typeof data.rajjudosh === 'boolean' && (
            <MiniVerdict label="Rajju Dosha" bad={data.rajjudosh} />
          )}
          {typeof data.vedhadosh === 'boolean' && (
            <MiniVerdict label="Vedha Dosha" bad={data.vedhadosh} />
          )}
        </View>
      )}

      {!!rows.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Dosha Comparison</Text>
          <CompareHeader />
          {rows.map((d) => (
            <CompareRow
              key={d.points}
              label={d.label}
              left={normaliseFlag(data[d.points].boy)}
              right={normaliseFlag(data[d.points].girl)}
              invert={d.invert}
            />
          ))}
        </>
      )}

      {!!explanations.length && (
        <>
          <Divider />
          <Collapsible title="What each dosha means here" count={explanations.length} glyph="✎">
            {explanations.map((e) => (
              <View key={e.label} style={{marginBottom: verticalScale(8)}}>
                <Text style={styles.expLabel}>{e.label}</Text>
                <Prose>{e.text}</Prose>
              </View>
            ))}
          </Collapsible>
        </>
      )}

      {!!data.extended_response && (
        <Collapsible title="Detailed reading" glyph="◈">
          <Prose>{String(data.extended_response)}</Prose>
        </Collapsible>
      )}
    </SectionCard>
  );
}

// mangaldosh_points arrives as 0/100 numbers while every other pair is boolean.
// Coerce to boolean so one CompareRow renders them all consistently.
function normaliseFlag(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v > 0;
  return v;
}

function MiniVerdict({label, bad}) {
  return (
    <View style={[styles.miniVerdict, {borderColor: bad ? '#F3D2CC' : '#CDE8CE', backgroundColor: bad ? '#FDF0EE' : '#EDF7ED'}]}>
      <Ionicons
        name={bad ? 'close-circle' : 'checkmark-circle'}
        size={moderateScale(16)}
        color={bad ? ASTRO.bad : ASTRO.good}
      />
      <Text style={[styles.miniVerdictText, {color: bad ? ASTRO.bad : ASTRO.good}]}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Numerology                                                           */
/* ------------------------------------------------------------------ */

const PLANE_META = {
  intellectual: {glyph: '☿', hint: 'Mind and reasoning'},
  spiritual: {glyph: '♆', hint: 'Inner life'},
  material: {glyph: '♄', hint: 'Money and matter'},
  thought: {glyph: '☽', hint: 'Ideas and planning'},
  will: {glyph: '♂', hint: 'Determination'},
  outlook: {glyph: '☉', hint: 'How you see the world'},
  property: {glyph: '⌂', hint: 'Assets and home'},
  luck: {glyph: '✦', hint: 'Fortune'},
};

/**
 * The Lo Shu grid IS a three-by-three square — that is the whole idea of it.
 * The shipped app printed it as nine key/value rows, which throws away the one
 * thing that makes the reading possible: seeing which cells are empty.
 */
export function NumerologyNumbers({data, title = 'Your Numbers', glyph = '#', index = 0}) {
  if (!isObj(data)) {
    return <SectionCard title={title} glyph={glyph} index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const grid = isObj(data.loShuGrid) ? data.loShuGrid : null;
  const numberKeys = Object.keys(data).filter((k) => typeof data[k] === 'number');
  const planes = isObj(data.planePercentages) ? Object.entries(data.planePercentages) : [];
  const missing = typeof data.missingNumbers === 'string'
    ? data.missingNumbers.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const available = typeof data.availableNumbers === 'string'
    ? data.availableNumbers.split(',').map((s) => s.trim()).filter(Boolean) : [];

  // Traditional Lo Shu layout — the magic square, not 1..9 in reading order.
  const LAYOUT = [[4, 9, 2], [3, 5, 7], [8, 1, 6]];

  return (
    <SectionCard title={title} glyph={glyph} index={index}>
      {!!numberKeys.length && (
        <TileRow>
          {numberKeys.slice(0, 6).map((k) => (
            <StatTile key={k} label={humanize(k.replace(/Number$/, ''))} value={String(data[k])} />
          ))}
        </TileRow>
      )}

      {!!grid && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Lo Shu Grid</Text>
          <View style={styles.loshu}>
            {LAYOUT.map((rowNums, r) => (
              <View key={r} style={styles.loshuRow}>
                {rowNums.map((n) => {
                  const filled = grid[String(n)];
                  return (
                    <View
                      key={n}
                      style={[styles.loshuCell, filled ? styles.loshuCellOn : styles.loshuCellOff]}>
                      <Text style={[styles.loshuValue, !filled && styles.loshuValueOff]}>
                        {filled ? String(filled) : n}
                      </Text>
                      {!filled && <Text style={styles.loshuMissing}>missing</Text>}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          <Text style={styles.loshuHint}>
            Filled cells are the digits present in your date of birth; faded cells are missing.
          </Text>
        </>
      )}

      {(!!available.length || !!missing.length) && (
        <>
          <Divider />
          <PillRow label="Present" items={available} tone="good" />
          <PillRow label="Missing" items={missing} tone="bad" />
        </>
      )}

      {!!planes.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Plane Strengths</Text>
          {planes.map(([k, v], i) => {
            const meta = PLANE_META[k] || {};
            return (
              <ScoreBar
                key={k}
                label={`${meta.glyph ? `${meta.glyph}  ` : ''}${humanize(k)}`}
                value={Number(v) || 0}
                max={100}
                caption={meta.hint}
                index={i}
              />
            );
          })}
        </>
      )}

      {!!data.description && <><Divider /><Prose>{String(data.description)}</Prose></>}
    </SectionCard>
  );
}

/** Name analysis — a set of verdict sentences, each pass/fail. */
export function NameAnalysis({data, title = 'Name Analysis', index = 0}) {
  if (!isObj(data)) return null;
  const verdictKeys = Object.keys(data).filter(
    (k) => /Compatibility/i.test(k) && typeof data[k] === 'string',
  );
  const numbers = ['nameNumber', 'firstNameNumber'].filter((k) => data[k]);
  const lucky = ['luckyNumbers', 'neutralNumbers', 'unluckyNumbers'].filter((k) => data[k]);

  return (
    <SectionCard title={title} glyph="✎" index={index}>
      {!!data.description && <Prose>{String(data.description)}</Prose>}

      {!!numbers.length && (
        <>
          {!!data.description && <Divider />}
          <TileRow>
            {numbers.map((k) => (
              <StatTile
                key={k}
                label={k === 'nameNumber' ? 'Full Name' : 'First Name'}
                // "Your Name number as per Chaldean Numerology is : 3" — the
                // number is the content; the sentence around it is packaging.
                value={(String(data[k]).match(/(\d+)\s*$/) || [, String(data[k])])[1]}
              />
            ))}
          </TileRow>
        </>
      )}

      {!!verdictKeys.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Compatibility</Text>
          {verdictKeys.map((k) => {
            const text = String(data[k]);
            const good = /^great/i.test(text);
            return (
              <View key={k} style={styles.verdictLineRow}>
                <Ionicons
                  name={good ? 'checkmark-circle' : 'alert-circle'}
                  size={moderateScale(15)}
                  color={good ? ASTRO.good : ASTRO.warn}
                  style={{marginTop: 2}}
                />
                <View style={{flex: 1, marginLeft: scale(7)}}>
                  <Text style={styles.verdictKey}>{humanize(k.replace(/AsPer/g, ' as per '))}</Text>
                  <Text style={styles.verdictText}>{text}</Text>
                </View>
              </View>
            );
          })}
        </>
      )}

      {!!lucky.length && (
        <>
          <Divider />
          {lucky.map((k) => {
            const raw = String(data[k]);
            const nums = (raw.split(':')[1] || raw).split(',').map((s) => s.trim()).filter(Boolean);
            return (
              <PillRow
                key={k}
                label={humanize(k)}
                items={nums}
                tone={k === 'luckyNumbers' ? 'good' : k === 'unluckyNumbers' ? 'bad' : 'default'}
              />
            );
          })}
        </>
      )}

      {Array.isArray(data.suggestedNameSpellings) && !!data.suggestedNameSpellings.length && (
        <Collapsible title="Suggested name spellings" count={data.suggestedNameSpellings.length} glyph="✦">
          {data.suggestedNameSpellings.map((entry, i) => (
            isObj(entry)
              ? Object.entries(entry).map(([heading, reasons]) => (
                <View key={heading} style={{marginBottom: verticalScale(8)}}>
                  <Text style={styles.expLabel}>{heading}</Text>
                  <NumberedList items={Array.isArray(reasons) ? reasons : [reasons]} />
                </View>
              ))
              : <Text key={i} style={styles.bullet}>• {String(entry)}</Text>
          ))}
        </Collapsible>
      )}
    </SectionCard>
  );
}

/** Mobile-number analysis — digit-by-digit. */
export function MobileAnalysis({data, title = 'Mobile Number', index = 0}) {
  if (!isObj(data)) return null;
  const sum = (String(data.mobileNumberSum || '').match(/(\d+)\s*$/) || [])[1];
  const digits = Array.isArray(data.individualDigitAnalysis) ? data.individualDigitAnalysis : [];
  const results = Array.isArray(data.mobileNumberSumResult) ? data.mobileNumberSumResult : [];
  const favourable = !results.some((r) => /not favorable|not favourable/i.test(String(r)));

  return (
    <SectionCard title={title} glyph="☎" index={index}>
      {!!data.mobileNumber && (
        <Text style={styles.phone}>{String(data.mobileNumber).replace(/^.*?:\s*/, '')}</Text>
      )}
      {!!sum && (
        <View style={styles.sumRow}>
          <RingGauge value={Number(sum)} max={9} label="Number Sum" size={moderateScale(96)} />
          <View style={{flex: 1, marginLeft: scale(12)}}>
            <Badge text={favourable ? 'Favourable' : 'Not Favourable'} tone={favourable ? 'good' : 'bad'} />
            {!!data.mobileNumberDescriptions && (
              <Text style={styles.verdictLine}>{String(data.mobileNumberDescriptions)}</Text>
            )}
          </View>
        </View>
      )}
      {!!results.length && (
        <>
          <Divider />
          {results.map((r, i) => (
            <Callout key={i} tone={favourable ? 'good' : 'warn'} icon="information-circle">{String(r)}</Callout>
          ))}
        </>
      )}
      {!!digits.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>Digit Meanings</Text>
          {digits.map((d, i) => (
            <View key={i} style={styles.digitRow}>
              <View style={styles.digitBadge}>
                <Text style={styles.digitBadgeText}>
                  {(String(d.digit || '').match(/(\d+)/) || ['?'])[0]}
                </Text>
              </View>
              <Text style={styles.digitMeaning}>{String(d.meaning || '')}</Text>
            </View>
          ))}
        </>
      )}
      {!!data.negativeNumbers && (
        <Callout tone="warn" icon="alert-circle">{String(data.negativeNumbers)}</Callout>
      )}
    </SectionCard>
  );
}

/** Lucky colours / days / directions — inherently a set of chips, not prose. */
export function LuckyThings({data, title = 'Lucky For You', index = 0}) {
  const lt = isObj(data) ? (isObj(data.luckyThings) ? data.luckyThings : data) : null;
  if (!lt) return null;

  // The payload nests {label, value} pairs two levels deep under themed groups.
  const pairs = [];
  for (const group of Object.values(lt)) {
    if (!isObj(group)) continue;
    for (const entry of Object.values(group)) {
      if (isObj(entry) && entry.label && entry.value) {
        pairs.push({label: humanize(entry.label.toLowerCase()), value: String(entry.value).replace(/,\s*$/, '')});
      }
    }
  }
  const singles = [
    {label: 'Ruling Planet', value: lt.ruler, glyph: PLANET_GLYPH[lt.ruler] || '✦'},
    {label: 'Element', value: lt.element, glyph: '◆'},
    {label: 'Sun Sign', value: lt.sunSign, glyph: ZODIAC_GLYPH[lt.sunSign] || '☉'},
    {label: 'Best Time', value: lt.best_time_of_the_day, glyph: '◷'},
  ].filter((s) => s.value);

  return (
    <SectionCard title={title} glyph="★" index={index}>
      {!!singles.length && (
        <View style={styles.signRow}>
          {singles.map((s) => (
            <View key={s.label} style={styles.signCard}>
              <Text style={styles.signGlyph}>{s.glyph}</Text>
              <Text style={styles.signValue} numberOfLines={1}>{s.value}</Text>
              <Text style={styles.signLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
      {!!pairs.length && (
        <>
          <Divider />
          {pairs.map((p) => (
            <PillRow
              key={p.label}
              label={p.label}
              items={p.value.split(',').map((s) => s.trim()).filter(Boolean)}
              tone={/unlucky|avoid/i.test(p.label) ? 'bad' : /lucky/i.test(p.label) ? 'good' : 'default'}
            />
          ))}
        </>
      )}
      {Array.isArray(lt.traits) && !!lt.traits.length && (
        <><Divider /><PillRow label="Traits" items={lt.traits} /></>
      )}
      {Array.isArray(lt.favourable_periods) && !!lt.favourable_periods.length && (
        <PillRow label="Favourable Periods" items={lt.favourable_periods} tone="good" />
      )}
      {!!data?.description && <><Divider /><Prose>{String(data.description)}</Prose></>}
    </SectionCard>
  );
}

/** Personal-year forecast. */
export function PersonalYear({data, title = 'Personal Year', index = 0}) {
  if (!isObj(data)) return null;
  const year = (String(data.personalYear || '').match(/(\d+)\s*$/) || [])[1];
  const desc = isObj(data.description) ? data.description : null;
  const luck = isObj(data.luckFactorDetails) ? data.luckFactorDetails : null;
  const luckPct = luck && Array.isArray(luck.descriptions)
    ? (String(luck.descriptions[0] || '').match(/(\d+)\s*%/) || [])[1] : null;

  return (
    <SectionCard title={title} glyph="◷" index={index}>
      <View style={styles.pyHero}>
        {!!year && <RingGauge value={Number(year)} max={9} label="Personal Year" size={moderateScale(104)} />}
        <View style={{flex: 1, marginLeft: scale(12)}}>
          {!!desc?.title && <Text style={styles.pyTitle}>{desc.title}</Text>}
          {!!luckPct && (
            <View style={{marginTop: verticalScale(6)}}>
              <ScoreBar label="Luck Factor" value={Number(luckPct)} max={100} />
            </View>
          )}
        </View>
      </View>
      {!!desc?.description && <><Divider /><Prose>{String(desc.description)}</Prose></>}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Lal Kitab                                                            */
/* ------------------------------------------------------------------ */

const ROMAN_HOUSE = {
  First: 1, Second: 2, Third: 3, Fourth: 4, Fifth: 5, Sixth: 6,
  Seventh: 7, Eighth: 8, Ninth: 9, Tenth: 10, Eleventh: 11, Twelfth: 12,
};

const SHORT_PLANET = {
  SUN: 'Su', MOON: 'Mo', MARS: 'Ma', MERCURY: 'Me', JUPITER: 'Ju',
  VENUS: 'Ve', SATURN: 'Sa', RAHU: 'Ra', KETU: 'Ke',
};

/**
 * Lal Kitab horoscope as an actual 12-house chart.
 *
 * The payload is [{sign, sign_name, planet[], planet_small[]}] × 12 — a chart in
 * list form. The shipped app printed "Sign 1 / Sign Name Aries / PLANET • SUN •
 * MERCURY…" down the screen, so the reader had to hold twelve houses in their
 * head to picture it. A grid IS the picture.
 */
export function LalKitabHoroscope({data, title = 'Lal Kitab Chart', index = 0}) {
  const houses = Array.isArray(data) ? data.filter(isObj) : [];
  if (!houses.length) {
    return <SectionCard title={title} glyph="📕" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  return (
    <SectionCard title={title} glyph="📕" subtitle="Planets by sign" index={index}>
      <View style={styles.hGrid}>
        {houses.map((h, i) => {
          const planets = Array.isArray(h.planet) ? h.planet : [];
          return (
            <View key={i} style={[styles.hCell, planets.length ? styles.hCellFull : null]}>
              <View style={styles.hCellTop}>
                <Text style={styles.hCellNum}>{h.sign ?? i + 1}</Text>
                <Text style={styles.hCellGlyph}>{ZODIAC_GLYPH[h.sign_name] || ''}</Text>
              </View>
              <Text style={styles.hCellName} numberOfLines={1}>{h.sign_name || '—'}</Text>
              <View style={styles.hCellPlanets}>
                {planets.length ? planets.map((p) => (
                  <View key={p} style={styles.hPlanet}>
                    <Text style={styles.hPlanetText}>{SHORT_PLANET[p] || p}</Text>
                  </View>
                )) : <Text style={styles.hEmpty}>—</Text>}
              </View>
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
}

/** The 12 khanas with their lords, exalted and debilitated planets. */
export function LalKitabHouses({data, title = 'Houses (Khana)', index = 0}) {
  const rows = Array.isArray(data) ? data.filter(isObj) : [];
  if (!rows.length) {
    return <SectionCard title={title} glyph="⌂" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const listOf = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => x && x !== '-');

  return (
    <SectionCard title={title} glyph="⌂" subtitle={`${rows.length} khanas`} index={index}>
      {rows.map((h, i) => (
        <View key={i} style={styles.khana}>
          <View style={styles.khanaNum}>
            <Text style={styles.khanaNumText}>{h.khana_number ?? i + 1}</Text>
          </View>
          <View style={{flex: 1}}>
            <View style={styles.khanaTop}>
              <Text style={styles.khanaOwner}>
                Lord: <Text style={styles.khanaOwnerVal}>{h.maalik || '—'}</Text>
              </Text>
              {h.soya === true && (
                <View style={styles.sleepBadge}>
                  <Text style={styles.sleepBadgeText}>Sleeping</Text>
                </View>
              )}
            </View>
            <Text style={styles.khanaSub}>
              Pakka Ghar: {h.pakka_ghar || '—'}   ·   Kismat: {h.kismat || '—'}
            </Text>
            <View style={styles.khanaPills}>
              <PillRow label={null} items={listOf(h.exalt).map((p) => `↑ ${p}`)} tone="good" />
              <PillRow label={null} items={listOf(h.debilitated).map((p) => `↓ ${p}`)} tone="bad" />
            </View>
          </View>
        </View>
      ))}
    </SectionCard>
  );
}

/** Per-planet effects + remedies, one collapsible each. */
export function LalKitabRemedies({data, title = 'Planet Remedies', index = 0}) {
  if (!isObj(data)) {
    return <SectionCard title={title} glyph="✚" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const entries = Object.entries(data).filter(([, v]) => isObj(v) && (v.effects || v.remedies));
  if (!entries.length) {
    return <SectionCard title={title} glyph="✚" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }

  return (
    <SectionCard
      title={title}
      glyph="✚"
      subtitle="Tap a planet to read its effects and remedies"
      index={index}>
      {entries.map(([k, v]) => {
        const remedies = Array.isArray(v.remedies) ? v.remedies : v.remedies ? [v.remedies] : [];
        const houseNo = ROMAN_HOUSE[v.house] || v.house;
        return (
          <Collapsible
            key={k}
            title={`${v.planet || humanize(k)}${houseNo ? ` · House ${houseNo}` : ''}`}
            count={remedies.length || undefined}
            glyph={PLANET_GLYPH[v.planet] || PLANET_GLYPH[humanize(k)] || '✦'}>
            {!!v.effects && (
              <View style={{marginBottom: verticalScale(8)}}>
                <Text style={styles.subLabel}>Effects</Text>
                <Prose>{String(v.effects)}</Prose>
              </View>
            )}
            {!!remedies.length && (
              <>
                <Text style={styles.subLabel}>Remedies</Text>
                <NumberedList items={remedies} />
              </>
            )}
          </Collapsible>
        );
      })}
    </SectionCard>
  );
}

/** Karmic debts — each with indications, events and remedies. */
export function LalKitabDebts({data, title = 'Karmic Debts (Rin)', index = 0}) {
  const rows = Array.isArray(data) ? data.filter(isObj) : [];
  if (!rows.length) {
    return (
      <SectionCard title={title} glyph="⚖" index={index}>
        <Callout tone="good" icon="shield-checkmark">No karmic debts found in your chart.</Callout>
      </SectionCard>
    );
  }
  return (
    <SectionCard title={title} glyph="⚖" subtitle={`${rows.length} found`} index={index}>
      {rows.map((d, i) => (
        <View key={i} style={styles.debt}>
          <View style={styles.debtHead}>
            <Ionicons name="alert-circle" size={moderateScale(16)} color={ASTRO.warn} />
            <Text style={styles.debtName}>{d.debt_name || `Debt ${i + 1}`}</Text>
          </View>
          {!!d.planetory && <Prose>{String(d.planetory)}</Prose>}
          {Array.isArray(d.indications) && !!d.indications.length && (
            <Collapsible title="Indications" count={d.indications.length} glyph="◈">
              <NumberedList items={d.indications} tone="maroon" />
            </Collapsible>
          )}
          {Array.isArray(d.events) && !!d.events.length && (
            <Collapsible title="Possible events" count={d.events.length} glyph="◷">
              <NumberedList items={d.events} tone="maroon" />
            </Collapsible>
          )}
          {Array.isArray(d.remedies) && !!d.remedies.length && (
            <Collapsible title="Remedies" count={d.remedies.length} glyph="✚">
              <NumberedList items={d.remedies} />
            </Collapsible>
          )}
        </View>
      ))}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* KP astrology                                                         */
/* ------------------------------------------------------------------ */

/** Cusp table — 12 houses with sign/star/sub lords, one card each. */
export function KpCusps({data, title = 'Cusp Details', index = 0}) {
  const rows = Array.isArray(data) ? data.filter(isObj) : [];
  if (!rows.length) {
    return <SectionCard title={title} glyph="◑" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  return (
    <SectionCard title={title} glyph="◑" subtitle="Sign, star and sub lord per house" index={index}>
      {rows.map((c, i) => (
        <View key={i} style={styles.cusp}>
          <View style={styles.cuspNum}>
            <Text style={styles.cuspNumText}>{c.house ?? i + 1}</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.cuspSign}>
              {ZODIAC_GLYPH[c.sign] || ''} {c.sign || '—'}
              {c.degree_dms ? <Text style={styles.cuspDeg}>  {c.degree_dms}</Text> : null}
            </Text>
            <View style={styles.cuspLords}>
              <CuspLord label="Sign" value={c.signLord} />
              <CuspLord label="Star" value={c.nakshatraLord} />
              <CuspLord label="Sub" value={c.subLord} />
              <CuspLord label="Sub-sub" value={c.subSubLord} />
            </View>
          </View>
        </View>
      ))}
    </SectionCard>
  );
}

function CuspLord({label, value}) {
  if (isBlank(value)) return null;
  return (
    <View style={styles.cuspLord}>
      <Text style={styles.cuspLordLabel}>{label}</Text>
      <Text style={styles.cuspLordValue}>{value}</Text>
    </View>
  );
}

/** House significators — {1: [planets], …}. Rendered as a house-by-house grid. */
export function KpSignificators({data, title = 'House Significators', index = 0}) {
  if (!isObj(data)) {
    return <SectionCard title={title} glyph="⌂" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const houses = Object.keys(data)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));
  if (!houses.length) {
    return <SectionCard title={title} glyph="⌂" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  return (
    <SectionCard title={title} glyph="⌂" subtitle="Planets signifying each house" index={index}>
      {houses.map((h) => {
        const planets = Array.isArray(data[h]) ? data[h] : [data[h]];
        return (
          <View key={h} style={styles.sigRow}>
            <View style={styles.sigNum}>
              <Text style={styles.sigNumText}>{h}</Text>
            </View>
            <View style={styles.sigPlanets}>
              {planets.filter(Boolean).map((p, i) => (
                <View key={i} style={styles.sigPlanet}>
                  <Text style={styles.sigPlanetGlyph}>{PLANET_GLYPH[p] || '✦'}</Text>
                  <Text style={styles.sigPlanetText}>{String(p)}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Ascendant report                                                     */
/* ------------------------------------------------------------------ */

/**
 * The ascendant payload is by far the richest prose in the kundli report — it
 * carries qualities, a gem, a fasting day and a gayatri mantra alongside the
 * predictions, and every one of those was collapsing into a single grey
 * paragraph. Broken out here into things a reader can actually pick up.
 */
export function AscendantReport({data, title = 'Ascendant Report', index = 0}) {
  const rows = Array.isArray(data) ? data.filter(isObj) : data ? [data] : [];
  if (!rows.length) return null;
  const r = rows[0];
  const split = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

  return (
    <SectionCard
      title={title}
      glyph={ZODIAC_GLYPH[r.ascendant] || '↑'}
      subtitle={r.ascendant ? `${r.ascendant} ascendant${r.symbol ? ` · ${r.symbol}` : ''}` : undefined}
      index={index}>
      <View style={styles.signRow}>
        {!!r.ascendant_lord && (
          <View style={styles.signCard}>
            <Text style={styles.signGlyph}>{PLANET_GLYPH[r.ascendant_lord] || '✦'}</Text>
            <Text style={styles.signValue} numberOfLines={1}>{r.ascendant_lord}</Text>
            <Text style={styles.signLabel}>Lagna Lord</Text>
          </View>
        )}
        {!!r.ascendant_lord_house_location && (
          <View style={styles.signCard}>
            <Text style={styles.signGlyph}>⌂</Text>
            <Text style={styles.signValue}>House {r.ascendant_lord_house_location}</Text>
            <Text style={styles.signLabel}>Placed In</Text>
          </View>
        )}
        {!!r.ascendant_lord_strength && (
          <View style={styles.signCard}>
            <Text style={styles.signGlyph}>◆</Text>
            <Text
              style={[
                styles.signValue,
                {color: /strong/i.test(r.ascendant_lord_strength) ? ASTRO.good : ASTRO.warn},
              ]}
              numberOfLines={1}>
              {r.ascendant_lord_strength}
            </Text>
            <Text style={styles.signLabel}>Strength</Text>
          </View>
        )}
      </View>

      {!!r.general_prediction && <><Divider /><Prose>{String(r.general_prediction)}</Prose></>}
      {!!r.personalised_prediction && (
        <>
          <Divider />
          <Text style={styles.subLabel}>For You Specifically</Text>
          <Prose>{String(r.personalised_prediction)}</Prose>
        </>
      )}

      {(!!r.good_qualities || !!r.bad_qualities) && (
        <>
          <Divider />
          <PillRow label="Strengths" items={split(r.good_qualities)} tone="good" />
          <PillRow label="Watch Out For" items={split(r.bad_qualities)} tone="bad" />
        </>
      )}

      {(!!r.lucky_gem || !!r.day_for_fasting || !!r.zodiac_characteristics) && (
        <>
          <Divider />
          <ChipGrid
            items={[
              {label: 'Lucky Gem', value: r.lucky_gem},
              {label: 'Fasting Day', value: r.day_for_fasting},
              {label: 'Nature', value: r.zodiac_characteristics},
            ]}
          />
        </>
      )}

      {!!r.gayatri_mantra && (
        <Collapsible title="Gayatri Mantra" glyph="ॐ">
          <Text style={styles.mantra}>{String(r.gayatri_mantra)}</Text>
        </Collapsible>
      )}
      {!!r.flagship_qualities && (
        <Collapsible title="Flagship qualities" glyph="★">
          <Prose>{String(r.flagship_qualities)}</Prose>
        </Collapsible>
      )}
      {!!r.spirituality_advice && (
        <Collapsible title="Spiritual guidance" glyph="✦">
          <Prose>{String(r.spirituality_advice)}</Prose>
        </Collapsible>
      )}

      {rows.length > 1 && (
        <Collapsible title="Additional readings" count={rows.length - 1} glyph="◈">
          {rows.slice(1).map((extra, i) => (
            <Prose key={i}>{String(extra.general_prediction || extra.prediction || '')}</Prose>
          ))}
        </Collapsible>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Catch-all section, styled like the rest                              */
/* ------------------------------------------------------------------ */

export function InfoSection({title, data, glyph = '◆', index = 0}) {
  if (!data) return null;
  // A bare descriptive string reads far better as prose than as a key/value row.
  if (typeof data === 'string') {
    return <SectionCard title={title} glyph={glyph} index={index}><Prose>{data}</Prose></SectionCard>;
  }
  return (
    <SectionCard title={title} glyph={glyph} index={index}>
      <GenericKeyVals data={data} />
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  dim: {fontSize: moderateScale(12), fontFamily: 'Lato-Regular', color: ASTRO.muted},
  subLabel: {
    fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    textTransform: 'uppercase', marginBottom: verticalScale(5), letterSpacing: 0.4,
  },
  bullet: {
    fontSize: moderateScale(12), lineHeight: moderateScale(18),
    fontFamily: 'Lato-Regular', color: ASTRO.ink, marginBottom: 2,
  },
  mantra: {
    fontSize: moderateScale(13), lineHeight: moderateScale(22), fontFamily: 'Lato-Bold',
    color: ASTRO.maroon, fontStyle: 'italic', textAlign: 'center',
  },

  /* planet cards */
  pCard: {
    borderWidth: 1, borderColor: ASTRO.line, borderRadius: moderateScale(10),
    backgroundColor: COLORS.white, padding: scale(10), marginBottom: verticalScale(8),
  },
  pHead: {flexDirection: 'row', alignItems: 'center'},
  pGlyphBox: {
    width: moderateScale(34), height: moderateScale(34), borderRadius: moderateScale(17),
    backgroundColor: ASTRO.parchmentDeep, alignItems: 'center', justifyContent: 'center',
    marginRight: scale(9),
  },
  pGlyph: {fontSize: moderateScale(17), color: ASTRO.maroon},
  pName: {fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: ASTRO.ink},
  pSign: {fontSize: moderateScale(11), fontFamily: 'Lato-Regular', color: ASTRO.muted, marginTop: 1},
  pFlags: {alignItems: 'flex-end'},
  flagBad: {backgroundColor: '#FDECEA', borderRadius: 20, paddingHorizontal: scale(6), paddingVertical: 2, marginBottom: 3},
  flagBadText: {fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.bad},
  flagWarn: {backgroundColor: '#FFF4E5', borderRadius: 20, paddingHorizontal: scale(6), paddingVertical: 2},
  flagWarnText: {fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.warn},
  pGrid: {
    flexDirection: 'row', flexWrap: 'wrap', marginTop: verticalScale(8),
    borderTopWidth: 1, borderTopColor: ASTRO.line, paddingTop: verticalScale(7),
  },
  pMini: {width: '33.33%', paddingRight: scale(6), marginBottom: verticalScale(6)},
  pMiniLabel: {
    fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  pMiniValue: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.ink},

  /* headline sign cards */
  signRow: {flexDirection: 'row', marginHorizontal: -scale(4)},
  signCard: {
    flex: 1, margin: scale(4), backgroundColor: COLORS.white, borderRadius: moderateScale(10),
    borderWidth: 1, borderColor: ASTRO.line, alignItems: 'center',
    paddingVertical: verticalScale(10), paddingHorizontal: scale(4),
  },
  signGlyph: {fontSize: moderateScale(22), color: ASTRO.gold},
  signValue: {fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.ink, marginTop: 3},
  signLabel: {
    fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1,
  },

  stoneRow: {flexDirection: 'row', marginHorizontal: -scale(4)},
  stone: {
    flex: 1, margin: scale(4), backgroundColor: '#FFFBF1', borderRadius: moderateScale(10),
    borderWidth: 1, borderColor: ASTRO.goldSoft, alignItems: 'center', paddingVertical: verticalScale(9),
  },
  stoneGlyph: {fontSize: moderateScale(17), color: ASTRO.gold},
  stoneValue: {fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.maroon, marginTop: 2},
  stoneLabel: {fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.muted, textTransform: 'uppercase'},

  /* dosha */
  verdictHero: {flexDirection: 'row', alignItems: 'center'},
  verdictIconBox: {
    width: moderateScale(76), alignItems: 'center', justifyContent: 'center',
  },
  verdictSide: {flex: 1, marginLeft: scale(12)},
  verdictLine: {
    fontSize: moderateScale(12), lineHeight: moderateScale(19), fontFamily: 'Lato-Regular',
    color: ASTRO.ink, marginTop: verticalScale(6),
  },
  srcRow: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -scale(3)},
  src: {
    flexGrow: 1, flexBasis: '30%', margin: scale(3), flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', borderRadius: moderateScale(8), borderWidth: 1,
    paddingVertical: verticalScale(7), paddingHorizontal: scale(6),
  },
  srcOn: {backgroundColor: '#FDF0EE', borderColor: '#F3D2CC'},
  srcOff: {backgroundColor: COLORS.white, borderColor: ASTRO.line},
  srcGlyph: {fontSize: moderateScale(13), marginRight: scale(4)},
  srcLabel: {fontSize: moderateScale(10), fontFamily: 'Lato-Bold', marginRight: scale(4)},

  /* koota */
  kootaHero: {flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(10)},
  kootaHeroSide: {flex: 1, marginLeft: scale(12)},
  kootaPair: {
    fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    marginTop: -verticalScale(6), marginBottom: verticalScale(8),
  },

  /* aggregate */
  aggHero: {alignItems: 'center', marginBottom: verticalScale(10)},
  flagPairRow: {flexDirection: 'row', marginHorizontal: -scale(4), marginTop: verticalScale(8)},
  miniVerdict: {
    flex: 1, margin: scale(4), flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: moderateScale(8), paddingVertical: verticalScale(8),
  },
  miniVerdictText: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', marginLeft: scale(5)},
  expLabel: {
    fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    marginBottom: verticalScale(3),
  },

  /* dasha */
  period: {flexDirection: 'row', alignItems: 'flex-start', paddingVertical: verticalScale(6)},
  periodCurrent: {
    backgroundColor: '#FFFDF3', borderRadius: moderateScale(8), paddingHorizontal: scale(6),
    borderWidth: 1, borderColor: ASTRO.goldSoft,
  },
  periodRail: {alignItems: 'center', width: scale(18), alignSelf: 'stretch'},
  periodDot: {
    width: scale(9), height: scale(9), borderRadius: scale(5),
    backgroundColor: ASTRO.line, marginTop: verticalScale(5),
    borderWidth: 2, borderColor: ASTRO.parchment,
  },
  periodDotCurrent: {backgroundColor: ASTRO.good, borderColor: '#CDE8CE'},
  periodLine: {flex: 1, width: 1.5, backgroundColor: ASTRO.line, marginTop: 1},
  periodTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  periodName: {fontSize: moderateScale(12.5), fontFamily: 'Lato-Bold', color: ASTRO.ink},
  periodLord: {fontSize: moderateScale(10), fontFamily: 'Lato-Regular', color: ASTRO.muted},
  periodDates: {fontSize: moderateScale(10), fontFamily: 'Lato-Regular', color: ASTRO.muted, marginTop: 1},
  spanTrack: {
    height: verticalScale(4), borderRadius: 20, backgroundColor: ASTRO.parchmentDeep,
    marginTop: verticalScale(4), marginBottom: verticalScale(2), overflow: 'hidden',
  },
  spanFill: {height: '100%', borderRadius: 20},

  /* lo shu */
  loshu: {alignSelf: 'center', marginVertical: verticalScale(4)},
  loshuRow: {flexDirection: 'row'},
  loshuCell: {
    width: moderateScale(64), height: moderateScale(58), margin: 2, borderRadius: moderateScale(8),
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  loshuCellOn: {backgroundColor: ASTRO.goldSoft, borderColor: ASTRO.gold},
  loshuCellOff: {backgroundColor: '#FBF6EE', borderColor: ASTRO.line, borderStyle: 'dashed'},
  loshuValue: {fontSize: moderateScale(18), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  loshuValueOff: {color: '#D6C6B4'},
  loshuMissing: {fontSize: moderateScale(8), fontFamily: 'Lato-Bold', color: '#D6C6B4', textTransform: 'uppercase'},
  loshuHint: {
    fontSize: moderateScale(10), fontFamily: 'Lato-Regular', color: ASTRO.muted,
    textAlign: 'center', marginTop: verticalScale(5),
  },

  /* numerology misc */
  phone: {
    fontSize: moderateScale(17), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    letterSpacing: 1.5, textAlign: 'center', marginBottom: verticalScale(8),
  },
  sumRow: {flexDirection: 'row', alignItems: 'center'},
  digitRow: {flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(7)},
  digitBadge: {
    width: moderateScale(28), height: moderateScale(28), borderRadius: moderateScale(14),
    backgroundColor: ASTRO.goldSoft, alignItems: 'center', justifyContent: 'center', marginRight: scale(9),
  },
  digitBadgeText: {fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  digitMeaning: {flex: 1, fontSize: moderateScale(12), fontFamily: 'Lato-Regular', color: ASTRO.ink},
  pyHero: {flexDirection: 'row', alignItems: 'center'},
  pyTitle: {fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: ASTRO.maroon},

  verdictLineRow: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: verticalScale(8)},
  verdictKey: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  verdictText: {fontSize: moderateScale(11.5), fontFamily: 'Lato-Regular', color: ASTRO.ink, lineHeight: moderateScale(17)},

  /* lal kitab 12-house grid */
  hGrid: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -scale(3)},
  hCell: {
    width: '33.33%', padding: scale(3),
  },
  hCellFull: {},
  hCellTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  hCellNum: {fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: ASTRO.muted},
  hCellGlyph: {fontSize: moderateScale(13), color: ASTRO.gold},
  hCellName: {fontSize: moderateScale(10.5), fontFamily: 'Lato-Bold', color: ASTRO.ink, marginTop: 1},
  hCellPlanets: {flexDirection: 'row', flexWrap: 'wrap', marginTop: verticalScale(4), minHeight: verticalScale(20)},
  hPlanet: {
    backgroundColor: ASTRO.goldSoft, borderRadius: 5, paddingHorizontal: scale(4),
    paddingVertical: 1, marginRight: 3, marginBottom: 3,
  },
  hPlanetText: {fontSize: moderateScale(9.5), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  hEmpty: {fontSize: moderateScale(10), color: '#D6C6B4'},

  khana: {
    flexDirection: 'row', borderWidth: 1, borderColor: ASTRO.line, borderRadius: moderateScale(9),
    backgroundColor: COLORS.white, padding: scale(9), marginBottom: verticalScale(7),
  },
  khanaNum: {
    width: moderateScale(28), height: moderateScale(28), borderRadius: moderateScale(14),
    backgroundColor: ASTRO.maroon, alignItems: 'center', justifyContent: 'center', marginRight: scale(9),
  },
  khanaNumText: {fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: COLORS.white},
  khanaTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  khanaOwner: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.muted},
  khanaOwnerVal: {color: ASTRO.ink},
  sleepBadge: {backgroundColor: ASTRO.parchmentDeep, borderRadius: 20, paddingHorizontal: scale(7), paddingVertical: 1},
  sleepBadgeText: {fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.muted},
  khanaSub: {fontSize: moderateScale(10.5), fontFamily: 'Lato-Regular', color: ASTRO.muted, marginTop: 2, marginBottom: 4},
  khanaPills: {},

  debt: {
    borderWidth: 1, borderColor: ASTRO.line, borderRadius: moderateScale(10),
    backgroundColor: '#FFFDF7', padding: scale(10), marginBottom: verticalScale(9),
  },
  debtHead: {flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(5)},
  debtName: {fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: ASTRO.maroon, marginLeft: scale(6)},

  /* kp */
  cusp: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: ASTRO.line,
    paddingVertical: verticalScale(8),
  },
  cuspNum: {
    width: moderateScale(26), height: moderateScale(26), borderRadius: moderateScale(13),
    backgroundColor: ASTRO.parchmentDeep, alignItems: 'center', justifyContent: 'center', marginRight: scale(9),
  },
  cuspNumText: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  cuspSign: {fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.ink},
  cuspDeg: {fontSize: moderateScale(10), fontFamily: 'Lato-Regular', color: ASTRO.muted},
  cuspLords: {flexDirection: 'row', flexWrap: 'wrap', marginTop: verticalScale(4)},
  cuspLord: {marginRight: scale(12), marginBottom: verticalScale(2)},
  cuspLordLabel: {fontSize: moderateScale(8.5), fontFamily: 'Lato-Bold', color: ASTRO.muted, textTransform: 'uppercase'},
  cuspLordValue: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.ink},

  sigRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(6),
    borderBottomWidth: 1, borderBottomColor: ASTRO.line,
  },
  sigNum: {
    width: moderateScale(26), height: moderateScale(26), borderRadius: moderateScale(13),
    backgroundColor: ASTRO.maroon, alignItems: 'center', justifyContent: 'center', marginRight: scale(9),
  },
  sigNumText: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: COLORS.white},
  sigPlanets: {flex: 1, flexDirection: 'row', flexWrap: 'wrap'},
  sigPlanet: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBF1',
    borderWidth: 1, borderColor: ASTRO.goldSoft, borderRadius: 20,
    paddingHorizontal: scale(7), paddingVertical: 2, marginRight: 4, marginBottom: 3,
  },
  sigPlanetGlyph: {fontSize: moderateScale(11), color: ASTRO.gold, marginRight: 3},
  sigPlanetText: {fontSize: moderateScale(10.5), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
});
