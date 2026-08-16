// Domain blocks that render specific JyotishamAstroAPI payloads properly.
//
// Built against REAL captured responses (all 22 endpoints these reports use, re-captured
// live 2026-08-16 in both en and hi), which is the thing the original generic renderer
// could not do — it was written without live API access, so it defensively dumped every
// payload as label/value text.
//
// TWO RULES THAT MUST NOT BE BROKEN HERE
//
//  1. NEVER DROP API TEXT. The provider is paid per call and the customer is paid per
//     report; every sentence that comes back gets displayed somewhere. Where a block pulls
//     a number out of a sentence for a headline ("Your Name number ... is : 3" → a big 3),
//     the ORIGINAL sentence is still rendered underneath. `Collapsible` is fine — it hides
//     nothing, it defers. `slice()` on a content array is not, and there is none left.
//  2. STAY PROGRESSIVE. Every block checks for the shape it expects and falls back to a
//     plain key/value listing otherwise, so an upstream payload change degrades instead of
//     crashing or coming up blank.
//
// LANGUAGE. Reports can be fetched with lang=hi, which returns the whole payload in Hindi
// (see components/astro/ReportLanguage.js). That means two things for code here: labels
// come from t(), and any lookup keyed on an API string (sign names, planet names) must
// tolerate Devanagari — see the glyph maps in AstroUI.
import React, {useContext} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {LanguageContext} from '../../context/LanguageContext';
import {
  ASTRO, SectionCard, StatTile, TileRow, ScoreBar, Badge, ChipGrid, Prose,
  Divider, KeyVal, humanize, ZODIAC_GLYPH, PLANET_GLYPH,
  RingGauge, Collapsible, NumberedList, CompareRow, CompareHeader, Callout, PillRow,
} from './AstroUI';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isBlank = (v) => v === undefined || v === null || v === '' || v === '-';
const asList = (v) => (Array.isArray(v) ? v.filter((x) => !isBlank(x)) : isBlank(v) ? [] : [v]);

// Pulls a trailing number out of a sentence for a headline tile. The caller ALWAYS still
// renders the full sentence — see rule 1 above.
const trailingNumber = (s) => (String(s ?? '').match(/(\d+)\s*$/) || [])[1];

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
 * This was a six-column table inside a horizontal ScrollView. On a phone half the columns
 * sit off-screen at any moment and the reader has to scrub sideways per row to assemble one
 * planet's story. One card per planet fits the screen, keeps a planet's facts together, and
 * makes retrograde/combust impossible to miss.
 */
export function PlanetTable({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  const heading = title || t('report.planetaryPositions');
  const planets = extractPlanets(data);
  if (!planets.length) {
    return <SectionCard title={heading} glyph="☉" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const luckyGem = Array.isArray(data?.lucky_gem) ? data.lucky_gem.join(', ') : data?.lucky_gem;
  const luckyNum = Array.isArray(data?.lucky_num) ? data.lucky_num.join(', ') : data?.lucky_num;

  return (
    <SectionCard
      title={heading}
      glyph="☉"
      subtitle={t('report.positionsAtBirth', {count: planets.length})}
      index={index}>
      {planets.map((p, i) => {
        const name = p.full_name || p.name || p.planet || '—';
        const glyph = PLANET_GLYPH[name] || PLANET_GLYPH[p.name] || '•';
        // Lal Kitab's planet list carries `rashi` where the horoscope endpoints use
        // `zodiac`/`sign`; without it the card header read "SUN —" with the sign only
        // appearing further down as a detail cell.
        const sign = p.zodiac || p.sign || p.rashi;
        const zGlyph = ZODIAC_GLYPH[sign] || '';
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
                  {zGlyph ? `${zGlyph} ` : ''}{isBlank(sign) ? '—' : sign}
                  {p.house ? `  ·  ${t('report.house')} ${p.house}` : ''}
                </Text>
              </View>
              {/* Combustion and retrogression change a reading materially, so they get a
                  visible marker rather than a buried field. */}
              <View style={styles.pFlags}>
                {!!retro && <View style={styles.flagBad}><Text style={styles.flagBadText}>℞ {t('report.retrograde')}</Text></View>}
                {!!combust && <View style={styles.flagWarn}><Text style={styles.flagWarnText}>{t('report.combust')}</Text></View>}
              </View>
            </View>
            <View style={styles.pGrid}>
              <PMini label={t('report.degree')} value={p.local_degree_dms || p.longitude_dms} />
              <PMini label={t('report.nakshatra')} value={p.nakshatra} />
              <PMini label={t('report.pada')} value={p.nakshatra_pada} />
              <PMini label={t('report.nakLord')} value={p.nakshatra_lord || p.nakshatraLord} />
              <PMini label={t('report.signLord')} value={p.signLord} />
              <PMini label={t('report.subLord')} value={p.subLord} />
              <PMini label={t('report.subSubLord')} value={p.subSubLord} />
              <PMini label={t('report.position')} value={p.position} />
              <PMini label={t('report.nature')} value={p.nature} />
            </View>
          </View>
        );
      })}

      {(luckyGem || luckyNum) && (
        <>
          <Divider />
          <TileRow>
            {!!luckyGem && <StatTile label={t('report.luckyGem')} value={luckyGem} />}
            {!!luckyNum && <StatTile label={t('report.luckyNumber')} value={luckyNum} />}
          </TileRow>
        </>
      )}
    </SectionCard>
  );
}

function PMini({label, value}) {
  if (isBlank(value)) return null;
  return (
    <View style={styles.pMini}>
      <Text style={styles.pMiniLabel}>{label}</Text>
      <Text style={styles.pMiniValue}>{String(value)}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Kundli attributes + gemstones                                        */
/* ------------------------------------------------------------------ */

const STONE_KEYS = ['life_stone', 'lucky_stone', 'fortune_stone'];
const STONE_ICON = {life_stone: '◆', lucky_stone: '★', fortune_stone: '✦'};

export function KundliAttributes({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  if (!isObj(data)) return null;
  const heading = title || t('report.birthAttributes');
  const stones = STONE_KEYS.filter((k) => data[k]);
  const attrKeys = Object.keys(data).filter(
    (k) => !STONE_KEYS.includes(k) && !isObj(data[k]) && !Array.isArray(data[k]),
  );

  // The sign trio is the headline of a kundli — lift it out of the chip soup so the reader
  // sees their placements before the fine detail. Everything else still renders below.
  const headline = [
    {label: t('report.ascendant'), value: data.ascendant_sign, glyph: ZODIAC_GLYPH[data.ascendant_sign] || '↑'},
    {label: t('report.moonSign'), value: data.rasi, glyph: ZODIAC_GLYPH[data.rasi] || '☽'},
    {label: t('report.sunSign'), value: data.sun_sign, glyph: ZODIAC_GLYPH[data.sun_sign] || '☉'},
  ].filter((h) => h.value);

  const rest = attrKeys.filter((k) => !['ascendant_sign', 'rasi', 'sun_sign'].includes(k));

  return (
    <SectionCard title={heading} glyph="✦" index={index}>
      {!!headline.length && (
        <View style={styles.signRow}>
          {headline.map((h) => (
            <View key={h.label} style={styles.signCard}>
              <Text style={styles.signGlyph}>{h.glyph}</Text>
              <Text style={styles.signValue}>{h.value}</Text>
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
          <Text style={styles.subLabel}>{t('report.recommendedStones')}</Text>
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
 * Presence of a dosha, derived from whichever field the endpoint actually uses.
 *
 * /dosha/manglik-dosh has NO is_dosha_present — it reports three independent sources
 * (mars / saturn / rahu-ketu) plus a score. Deriving from those is what stops it falling
 * through to a raw key/value dump.
 */
export function doshaPresence(d) {
  if (!isObj(d)) return null;
  if (typeof d.is_dosha_present === 'boolean') return d.is_dosha_present;
  const keys = ['manglik_by_mars', 'manglik_by_saturn', 'manglik_by_rahuketu']
    .filter((k) => typeof d[k] === 'boolean');
  return keys.length ? keys.some((k) => d[k]) : null;
}

/**
 * A dosha report answers one question: do I have it, and how badly. That answer leads —
 * ring gauge and verdict badge — with the ten-paragraph remedy list deferred behind a
 * count underneath. Nothing is discarded; the count tells the reader exactly how much is
 * waiting behind the tap.
 */
export function DoshaVerdict({title, data, glyph = '⚠', index = 0}) {
  const {t} = useContext(LanguageContext);
  if (!isObj(data)) {
    return <SectionCard title={title} glyph={glyph} index={index}><GenericKeyVals data={data} /></SectionCard>;
  }

  const remedies = asList(data.remedies);
  const effects = asList(data.effects);
  const aspects = asList(data.aspects);
  const factors = Array.isArray(data.factors) ? data.factors
    : isObj(data.factors) ? Object.values(data.factors) : [];

  const sources = [
    {key: 'manglik_by_mars', label: t('report.byMars'), glyph: '♂'},
    {key: 'manglik_by_saturn', label: t('report.bySaturn'), glyph: '♄'},
    {key: 'manglik_by_rahuketu', label: t('report.byRahuKetu'), glyph: '☊'},
  ].filter((s) => typeof data[s.key] === 'boolean');

  const present = doshaPresence(data);
  if (present === null && !sources.length) {
    return <SectionCard title={title} glyph={glyph} index={index}><GenericKeyVals data={data} /></SectionCard>;
  }

  const partial = data.is_anshik === true;
  const tone = present ? (partial ? 'warn' : 'bad') : 'good';
  const label = present
    ? (partial ? t('report.partiallyPresent') : t('report.present'))
    : t('report.notPresent');
  const hasScore = typeof data.score === 'number';

  return (
    <SectionCard title={title} glyph={glyph} index={index}>
      <View style={styles.verdictHero}>
        {hasScore ? (
          <RingGauge
            value={data.score}
            max={100}
            label={t('report.intensity')}
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
          {!!data.bot_response && <Text style={styles.verdictLine}>{String(data.bot_response)}</Text>}
        </View>
      </View>

      {!!sources.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>{t('report.sources')}</Text>
          <View style={styles.srcRow}>
            {sources.map((s) => (
              <View key={s.key} style={[styles.src, data[s.key] ? styles.srcOn : styles.srcOff]}>
                <Text style={[styles.srcGlyph, {color: data[s.key] ? ASTRO.bad : ASTRO.muted}]}>{s.glyph}</Text>
                <Text style={[styles.srcLabel, {color: data[s.key] ? ASTRO.bad : ASTRO.muted}]}>{s.label}</Text>
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
          <Text style={styles.subLabel}>{t('report.why')}</Text>
          {factors.map((f, i) => (
            <Callout key={i} tone="warn" icon="information-circle">{String(f)}</Callout>
          ))}
        </>
      )}

      {!!aspects.length && (
        <>
          <Text style={styles.subLabel}>{t('report.aspects')}</Text>
          <NumberedList items={aspects} tone="maroon" />
        </>
      )}

      {isObj(data.cancellation) && Number(data.cancellation.cancellationScore) > 0 && (
        <>
          <Divider />
          <Callout tone="good" icon="shield-checkmark">
            {t('report.cancellationScore', {score: data.cancellation.cancellationScore}) +
              (asList(data.cancellation.cancellationReason).length
                ? ` — ${asList(data.cancellation.cancellationReason).join('; ')}`
                : '')}
          </Callout>
        </>
      )}

      {!!effects.length && (
        <Collapsible title={t('report.effects')} count={effects.length} glyph="◈">
          <NumberedList items={effects} tone="maroon" />
        </Collapsible>
      )}

      {!!remedies.length && (
        <>
          <Divider />
          <Collapsible title={t('report.remedies')} count={remedies.length} glyph="✚">
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
 * Four genuinely different shapes come back:
 *   current-mahadasha-full → [{name, start, end}]                       (already fine)
 *   mahadasha              → {mahadasha:[names], mahadasha_order:[starts]}
 *   yogini-dasha-main      → {dasha_list, dasha_end_dates, dasha_lord_list}
 *   yogini-dasha-sub       → [{main_dasha, main_dasha_lord, sub_dasha_list,
 *                              sub_dasha_end_dates, sub_dasha_start_dates}] × 24
 * All but the first are parallel arrays: index i of each describes ONE period. Printing
 * them as separate lists — which is what the shipped app did — destroys the pairing that
 * is the entire content of a dasha table. The last shape is handled by DashaGroups below,
 * because it is a list of GROUPS each containing its own parallel arrays.
 */
export function normalizePeriods(input) {
  if (Array.isArray(input) && input.some((p) => isObj(p) && p.name)) {
    return input.filter((p) => isObj(p) && p.name);
  }
  if (!isObj(input)) return [];

  if (Array.isArray(input.mahadasha) && Array.isArray(input.mahadasha_order)) {
    const starts = input.mahadasha_order;
    return input.mahadasha.map((name, i) => ({
      name,
      start: starts[i],
      // Each period runs up to the next one's start; the last has no successor.
      end: starts[i + 1],
    }));
  }

  const zip = (names, ends, lords, firstStart) => names.map((name, i) => ({
    name,
    // The first period starts where the group does, or at birth if unstated.
    start: i === 0 ? firstStart : ends[i - 1],
    end: ends[i],
    lord: Array.isArray(lords) ? lords[i] : undefined,
  }));

  if (Array.isArray(input.dasha_list) && Array.isArray(input.dasha_end_dates)) {
    return zip(input.dasha_list, input.dasha_end_dates, input.dasha_lord_list, undefined);
  }
  if (Array.isArray(input.sub_dasha_list) && Array.isArray(input.sub_dasha_end_dates)) {
    return zip(
      input.sub_dasha_list, input.sub_dasha_end_dates, null,
      // sub_dasha_start_dates is a single string for the whole group, not an array.
      typeof input.sub_dasha_start_dates === 'string' ? input.sub_dasha_start_dates : undefined,
    );
  }
  return [];
}

// The API mixes "Sat 31 Oct 1998" and "Mon, May 27, 2002, 12:00:00 AM".
// Date.parse handles both once the leading weekday is dropped.
export function parseDate(s) {
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

function findCurrent(list) {
  const now = Date.now();
  return list.findIndex((p) => {
    const s = parseDate(p.start);
    const e = parseDate(p.end);
    if (!isNaN(s) && !isNaN(e)) return now >= s && now <= e;
    // A period with no explicit start runs from birth to its end.
    if (isNaN(s) && !isNaN(e)) return now <= e;
    return false;
  });
}

/** One row of a dasha timeline. Extracted so DashaGroups can reuse it. */
function PeriodRow({p, current, span, maxSpan, showLine, t}) {
  const years = span ? span / (365.25 * 24 * 3600 * 1000) : 0;
  return (
    <View style={[styles.period, current && styles.periodCurrent]}>
      <View style={styles.periodRail}>
        <View style={[styles.periodDot, current && styles.periodDotCurrent]} />
        {showLine && <View style={styles.periodLine} />}
      </View>
      <View style={{flex: 1}}>
        <View style={styles.periodTop}>
          <Text style={[styles.periodName, current && {color: ASTRO.maroon}]}>
            {PLANET_GLYPH[p.name] ? `${PLANET_GLYPH[p.name]} ` : ''}{p.name}
            {p.lord && p.lord !== p.name ? <Text style={styles.periodLord}>  ({p.lord})</Text> : null}
          </Text>
          {current && <Badge text={t('report.now')} tone="good" />}
        </View>
        <Text style={styles.periodDates}>
          {/* A period with no start of its own runs from birth — more useful than a dash. */}
          {p.start ? shortDate(p.start) : t('report.birth')} → {shortDate(p.end)}
          {years >= 0.1
            ? `  ·  ${years < 1
              ? `${Math.round(years * 12)} ${t('report.mo')}`
              : `${years.toFixed(years < 10 ? 1 : 0)} ${t('report.yr')}`}`
            : ''}
        </Text>
        {span > 0 && (
          <View style={styles.spanTrack}>
            <View
              style={[
                styles.spanFill,
                {width: `${Math.max(4, (span / maxSpan) * 100)}%`,
                  backgroundColor: current ? ASTRO.good : ASTRO.goldSoft},
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );
}

export function DashaTimeline({title, periods, glyph = '⏳', subtitle, index = 0}) {
  const {t} = useContext(LanguageContext);

  // yogini-dasha-sub is a list of groups, not a flat sequence — hand it off.
  if (Array.isArray(periods) && periods.some((p) => isObj(p) && Array.isArray(p.sub_dasha_list))) {
    return <DashaGroups title={title} groups={periods} glyph={glyph} subtitle={subtitle} index={index} />;
  }

  const list = normalizePeriods(periods);
  if (!list.length) {
    if (!periods) return null;
    return <SectionCard title={title} glyph={glyph} index={index}><GenericKeyVals data={periods} /></SectionCard>;
  }

  const currentIdx = findCurrent(list);

  // Longest period sets the bar scale, so relative duration is readable at a glance — a
  // 20-year Venus mahadasha should visibly dwarf a 6-year Sun.
  const spans = list.map((p) => {
    const s = parseDate(p.start);
    const e = parseDate(p.end);
    return !isNaN(s) && !isNaN(e) && e > s ? e - s : 0;
  });
  const maxSpan = Math.max(...spans, 1);

  const current = currentIdx >= 0 ? list[currentIdx] : null;
  // Start the visible window at the current period — nobody opens a dasha report to read
  // about 1998. Everything else stays one tap away, never removed.
  const startAt = currentIdx > 0 ? currentIdx : 0;
  const head = list.slice(startAt, startAt + MAX_VISIBLE_PERIODS);
  const before = list.slice(0, startAt);
  const after = list.slice(startAt + MAX_VISIBLE_PERIODS);

  const row = (p, i, abs, lastOfBlock) => (
    <PeriodRow
      key={abs}
      p={p}
      t={t}
      current={abs === currentIdx}
      span={spans[abs]}
      maxSpan={maxSpan}
      showLine={!lastOfBlock}
    />
  );

  return (
    <SectionCard
      title={title}
      glyph={glyph}
      subtitle={subtitle || t('report.periods', {count: list.length})}
      index={index}>
      {!!current && (
        <Callout tone="good" icon="time">
          {t('report.currentlyRunning', {
            name: current.lord && current.lord !== current.name
              ? `${current.name} (${current.lord})` : current.name,
            end: shortDate(current.end),
          })}
        </Callout>
      )}

      {!!before.length && (
        <Collapsible title={t('report.earlierPeriods')} count={before.length} glyph="↑">
          {before.map((p, i) => row(p, i, i, i === before.length - 1))}
        </Collapsible>
      )}

      {head.map((p, i) => row(p, i, startAt + i, i === head.length - 1))}

      {!!after.length && (
        <Collapsible title={t('report.laterPeriods')} count={after.length} glyph="↓">
          {after.map((p, i) => row(p, i, startAt + head.length + i, i === after.length - 1))}
        </Collapsible>
      )}
    </SectionCard>
  );
}

/**
 * yogini-dasha-sub: 24 groups, each a main dasha holding its own 8 sub-periods.
 *
 * This shape was the one still rendering as a raw dump after the first redesign pass —
 * "SUB DASHA LIST • Ulka • Siddha …" followed by "SUB DASHA END DATES • …", repeated 24
 * times down the screen with no connection between a name and its date. Each group is now
 * a collapsible holding a real zipped timeline, and the group containing today is open.
 */
export function DashaGroups({title, groups, glyph = '⏳', subtitle, index = 0}) {
  const {t} = useContext(LanguageContext);
  const rows = Array.isArray(groups) ? groups.filter(isObj) : [];
  if (!rows.length) {
    return <SectionCard title={title} glyph={glyph} index={index}><GenericKeyVals data={groups} /></SectionCard>;
  }

  const now = Date.now();
  const built = rows.map((g) => {
    const periods = normalizePeriods(g);
    const start = parseDate(g.sub_dasha_start_dates);
    const lastEnd = parseDate(periods.length ? periods[periods.length - 1].end : null);
    return {
      group: g,
      periods,
      active: !isNaN(start) && !isNaN(lastEnd) && now >= start && now <= lastEnd,
      start,
      lastEnd,
    };
  });
  const activeIdx = built.findIndex((b) => b.active);

  return (
    <SectionCard
      title={title}
      glyph={glyph}
      subtitle={subtitle || t('report.periods', {count: rows.length})}
      index={index}>
      {activeIdx >= 0 && (
        <Callout tone="good" icon="time">
          {t('report.currentlyRunning', {
            name: `${built[activeIdx].group.main_dasha}${built[activeIdx].group.main_dasha_lord
              ? ` (${built[activeIdx].group.main_dasha_lord})` : ''}`,
            end: shortDate(built[activeIdx].periods[built[activeIdx].periods.length - 1]?.end),
          })}
        </Callout>
      )}

      {built.map((b, gi) => {
        const spans = b.periods.map((p) => {
          const s = parseDate(p.start);
          const e = parseDate(p.end);
          return !isNaN(s) && !isNaN(e) && e > s ? e - s : 0;
        });
        const maxSpan = Math.max(...spans, 1);
        const curIdx = findCurrent(b.periods);
        const name = b.group.main_dasha || `#${gi + 1}`;
        const lord = b.group.main_dasha_lord;
        return (
          <Collapsible
            key={gi}
            defaultOpen={b.active}
            glyph={PLANET_GLYPH[lord] || PLANET_GLYPH[name] || '◈'}
            count={b.periods.length || undefined}
            title={
              `${name}${lord ? ` · ${lord}` : ''}` +
              (isNaN(b.start) ? '' : `   ${shortDate(b.group.sub_dasha_start_dates)} → ${shortDate(b.periods[b.periods.length - 1]?.end)}`)
            }>
            {b.periods.map((p, i) => (
              <PeriodRow
                key={i}
                p={p}
                t={t}
                current={b.active && i === curIdx}
                span={spans[i]}
                maxSpan={maxSpan}
                showLine={i < b.periods.length - 1}
              />
            ))}
          </Collapsible>
        );
      })}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Ashtakoot / Dashakoot match breakdown                                */
/* ------------------------------------------------------------------ */

// Each koota entry looks like {name, description, full_score, <key>: score}. The score sits
// under a key matching the koota itself (varna.varna etc), so derive it rather than
// hardcoding names.
function kootaScore(key, obj) {
  if (typeof obj[key] === 'number') return obj[key];
  const numeric = Object.entries(obj).find(([k, v]) => typeof v === 'number' && k !== 'full_score');
  return numeric ? numeric[1] : null;
}

export function KootaBreakdown({data, title, glyph = '❤', index = 0}) {
  const {t} = useContext(LanguageContext);
  const heading = title || t('report.totalGuna');
  if (!isObj(data)) {
    return <SectionCard title={heading} glyph={glyph} index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const kootas = Object.entries(data).filter(([, v]) => isObj(v) && v.full_score !== undefined);
  if (!kootas.length) {
    return <SectionCard title={heading} glyph={glyph} index={index}><GenericKeyVals data={data} /></SectionCard>;
  }

  const totalMax = kootas.reduce((s, [, v]) => s + (Number(v.full_score) || 0), 0);
  const totalGot = kootas.reduce((s, [k, v]) => s + (Number(kootaScore(k, v)) || 0), 0);
  const pct = totalMax ? Math.round((totalGot / totalMax) * 100) : 0;
  const tone = pct >= 70 ? 'good' : pct >= 50 ? 'warn' : 'bad';
  const verdict = pct >= 70 ? t('report.excellent') : pct >= 50 ? t('report.average') : t('report.low');

  return (
    <SectionCard title={heading} glyph={glyph} subtitle={t('report.pointByPoint')} index={index}>
      <View style={styles.kootaHero}>
        <RingGauge value={totalGot} max={totalMax} label={t('report.totalGuna')} />
        <View style={styles.kootaHeroSide}>
          <StatTile label={t('report.compatibility')} value={`${pct}%`} tone={tone} />
          <View style={{height: verticalScale(6)}} />
          <StatTile label={t('report.verdict')} value={verdict} tone={tone} />
        </View>
      </View>

      {!!data.bot_response && <Callout tone={tone}>{String(data.bot_response)}</Callout>}

      <Divider />
      {kootas.map(([k, v], i) => {
        // Each koota also carries the two people's own values (boy_varna / girl_varna).
        // Showing them makes the score explicable instead of arbitrary.
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
/* Aggregate match — the overall verdict                                */
/* ------------------------------------------------------------------ */

// {boy, girl} pairs in the aggregate payload, each with the plain-language sentence that
// goes with it. All of these are doshas, so `true` is the bad outcome.
const AGG_DOSHAS = [
  {points: 'mangaldosh_points', text: 'mangaldosh', key: 'report.mangalDosha'},
  {points: 'pitradosh_points', text: 'pitradosh', key: 'report.pitraDosha'},
  {points: 'kaalsarp_points', text: 'kaalsarpdosh', key: 'report.kaalSarpDosha'},
  {points: 'manglikdosh_saturn_points', text: 'manglikdosh_saturn', key: 'report.manglikSaturn'},
  {points: 'manglikdosh_rahuketu_points', text: 'manglikdosh_rahuketu', key: 'report.manglikRahuKetu'},
];

// mangaldosh_points arrives as 0/100 numbers while every other pair is boolean. Coerce so
// one CompareRow renders them all consistently.
function normaliseFlag(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v > 0;
  return v;
}

export function AggregateMatch({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  const heading = title || t('report.overallCompatibility');
  if (!isObj(data) || data.score === undefined) {
    return <SectionCard title={heading} glyph="∑" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const score = Number(data.score) || 0;
  const tone = score >= 70 ? 'good' : score >= 50 ? 'warn' : 'bad';
  const rows = AGG_DOSHAS.filter((d) => isObj(data[d.points]));
  const explanations = AGG_DOSHAS
    .filter((d) => typeof data[d.text] === 'string' && data[d.text])
    .map((d) => ({label: t(d.key), text: data[d.text]}));

  return (
    <SectionCard title={heading} glyph="∑" subtitle={t('report.everythingWeighed')} index={index}>
      <View style={styles.aggHero}>
        <RingGauge value={score} max={100} label={t('report.matchScore')} size={moderateScale(140)} />
      </View>

      {!!data.bot_response && <Callout tone={tone} icon="heart">{String(data.bot_response)}</Callout>}

      {(data.ashtakoot !== undefined || data.dashkoot !== undefined) && (
        <>
          <Divider />
          {data.ashtakoot !== undefined && <ScoreBar label="Ashtakoot" value={data.ashtakoot} max={36} index={0} />}
          {data.dashkoot !== undefined && <ScoreBar label="Dashakoot" value={data.dashkoot} max={10} index={1} />}
        </>
      )}

      {(typeof data.rajjudosh === 'boolean' || typeof data.vedhadosh === 'boolean') && (
        <View style={styles.flagPairRow}>
          {typeof data.rajjudosh === 'boolean' && (
            <MiniVerdict label={t('report.rajjuDosha')} bad={data.rajjudosh} />
          )}
          {typeof data.vedhadosh === 'boolean' && (
            <MiniVerdict label={t('report.vedhaDosha')} bad={data.vedhadosh} />
          )}
        </View>
      )}

      {!!rows.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>{t('report.doshaComparison')}</Text>
          <CompareHeader leftName={t('report.boy')} rightName={t('report.girl')} />
          {rows.map((d) => (
            <CompareRow
              key={d.points}
              label={t(d.key)}
              left={normaliseFlag(data[d.points].boy)}
              right={normaliseFlag(data[d.points].girl)}
              yesLabel={t('report.yes')}
              noLabel={t('report.no')}
              invert
            />
          ))}
        </>
      )}

      {!!explanations.length && (
        <>
          <Divider />
          <Collapsible title={t('report.whatEachDosha')} count={explanations.length} glyph="✎">
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
        <Collapsible title={t('report.detailedReading')} glyph="◈">
          <Prose>{String(data.extended_response)}</Prose>
        </Collapsible>
      )}
    </SectionCard>
  );
}

function MiniVerdict({label, bad}) {
  return (
    <View
      style={[
        styles.miniVerdict,
        {borderColor: bad ? '#F3D2CC' : '#CDE8CE', backgroundColor: bad ? '#FDF0EE' : '#EDF7ED'},
      ]}>
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

const PLANE_GLYPH = {
  intellectual: '☿', spiritual: '♆', material: '♄', thought: '☽',
  will: '♂', outlook: '☉', property: '⌂', luck: '✦',
};

/**
 * The Lo Shu grid IS a three-by-three square — that is the whole idea of it. The shipped
 * app printed it as nine key/value rows, which throws away the one thing that makes the
 * reading possible: seeing which cells are empty.
 */
export function NumerologyNumbers({data, title, glyph = '#', index = 0}) {
  const {t} = useContext(LanguageContext);
  const heading = title || t('report.yourNumbers');
  if (!isObj(data)) {
    return <SectionCard title={heading} glyph={glyph} index={index}><GenericKeyVals data={data} /></SectionCard>;
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
    <SectionCard title={heading} glyph={glyph} index={index}>
      {!!numberKeys.length && (
        <TileRow>
          {numberKeys.map((k) => (
            <StatTile key={k} label={humanize(k.replace(/Number$/, ''))} value={String(data[k])} />
          ))}
        </TileRow>
      )}

      {!!grid && (
        <>
          <Divider />
          <Text style={styles.subLabel}>{t('report.loShuGrid')}</Text>
          <View style={styles.loshu}>
            {LAYOUT.map((rowNums, r) => (
              <View key={r} style={styles.loshuRow}>
                {rowNums.map((n) => {
                  const filled = grid[String(n)];
                  return (
                    <View key={n} style={[styles.loshuCell, filled ? styles.loshuCellOn : styles.loshuCellOff]}>
                      <Text style={[styles.loshuValue, !filled && styles.loshuValueOff]}>
                        {filled ? String(filled) : n}
                      </Text>
                      {!filled && <Text style={styles.loshuMissing}>{t('report.missing')}</Text>}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          <Text style={styles.loshuHint}>{t('report.loShuHint')}</Text>
        </>
      )}

      {(!!available.length || !!missing.length) && (
        <>
          <Divider />
          <PillRow label={t('report.present')} items={available} tone="good" />
          <PillRow label={t('report.missing')} items={missing} tone="bad" />
        </>
      )}

      {!!planes.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>{t('report.planeStrengths')}</Text>
          {planes.map(([k, v], i) => (
            <ScoreBar
              key={k}
              label={`${PLANE_GLYPH[k] ? `${PLANE_GLYPH[k]}  ` : ''}${humanize(k)}`}
              value={Number(v) || 0}
              max={100}
              // planeNumbers holds which digits fall on this plane — the reason for the score.
              caption={isObj(data.planeNumbers) ? data.planeNumbers[k] : undefined}
              index={i}
            />
          ))}
        </>
      )}

      {/* Whatever the blocks above did not consume — missingNumbers as a raw string,
          realDigits, luckFactor — still renders, so nothing the API sent is lost. */}
      {!!data.description && <><Divider /><Prose>{String(data.description)}</Prose></>}
    </SectionCard>
  );
}

/** Name analysis — a set of verdict sentences, each pass/fail. */
export function NameAnalysis({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  if (!isObj(data)) return null;
  const heading = title || 'Name Analysis';
  const verdictKeys = Object.keys(data).filter(
    (k) => /Compatibility/i.test(k) && typeof data[k] === 'string',
  );
  const numbers = [
    {key: 'nameNumber', label: t('report.fullName')},
    {key: 'firstNameNumber', label: t('report.firstName')},
  ].filter((n) => data[n.key]);
  const lucky = [
    {key: 'luckyNumbers', tone: 'good'},
    {key: 'neutralNumbers', tone: 'default'},
    {key: 'unluckyNumbers', tone: 'bad'},
  ].filter((l) => data[l.key]);

  return (
    <SectionCard title={heading} glyph="✎" index={index}>
      {!!data.description && <Prose>{String(data.description)}</Prose>}

      {!!numbers.length && (
        <>
          {!!data.description && <Divider />}
          <TileRow>
            {numbers.map((n) => (
              <StatTile
                key={n.key}
                label={n.label}
                value={trailingNumber(data[n.key]) || String(data[n.key])}
              />
            ))}
          </TileRow>
          {/* The tile shows the number; the API's own sentence is kept verbatim beneath it
              rather than thrown away (see rule 1 at the top of this file). */}
          {numbers.map((n) => (
            <Text key={n.key} style={styles.sourceLine}>{String(data[n.key])}</Text>
          ))}
        </>
      )}

      {!!verdictKeys.length && (
        <>
          <Divider />
          <Text style={styles.subLabel}>{t('report.compatibility')}</Text>
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
          {lucky.map((l) => {
            const raw = String(data[l.key]);
            const nums = (raw.split(':')[1] || raw).split(',').map((s) => s.trim()).filter(Boolean);
            return <PillRow key={l.key} label={humanize(l.key)} items={nums} tone={l.tone} />;
          })}
        </>
      )}

      {!!data.suggestedNameNumber && (
        <><Divider /><Prose>{String(data.suggestedNameNumber)}</Prose></>
      )}
      {!!data.suggestedTotal && <Prose>{String(data.suggestedTotal)}</Prose>}

      {Array.isArray(data.suggestedNameSpellings) && !!data.suggestedNameSpellings.length && (
        <Collapsible
          title={t('report.suggestedSpellings')}
          count={data.suggestedNameSpellings.length}
          glyph="✦">
          {data.suggestedNameSpellings.map((entry, i) => (
            isObj(entry)
              ? Object.entries(entry).map(([hd, reasons]) => (
                <View key={hd} style={{marginBottom: verticalScale(8)}}>
                  <Text style={styles.expLabel}>{hd}</Text>
                  <NumberedList items={asList(reasons)} />
                </View>
              ))
              : <Text key={i} style={styles.bullet}>• {String(entry)}</Text>
          ))}
        </Collapsible>
      )}
    </SectionCard>
  );
}

/** Mobile-number analysis — digit by digit. */
export function MobileAnalysis({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  if (!isObj(data)) return null;
  const heading = title || 'Mobile Number';
  const sum = trailingNumber(data.mobileNumberSum);
  const digits = Array.isArray(data.individualDigitAnalysis) ? data.individualDigitAnalysis : [];
  const results = asList(data.mobileNumberSumResult);
  const favourable = !results.some((r) => /not favou?rable/i.test(String(r)));

  return (
    <SectionCard title={heading} glyph="☎" index={index}>
      {!!data.mobileNumber && <Text style={styles.phone}>{String(data.mobileNumber)}</Text>}
      {!!sum && (
        <View style={styles.sumRow}>
          <RingGauge value={Number(sum)} max={9} label={t('report.numberSum')} size={moderateScale(96)} />
          <View style={{flex: 1, marginLeft: scale(12)}}>
            <Badge
              text={favourable ? t('report.favourable') : t('report.notFavourable')}
              tone={favourable ? 'good' : 'bad'}
            />
            <Text style={styles.sourceLine}>{String(data.mobileNumberSum)}</Text>
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
          <Text style={styles.subLabel}>{t('report.digitMeanings')}</Text>
          {digits.map((d, i) => (
            <View key={i} style={styles.digitRow}>
              <View style={styles.digitBadge}>
                <Text style={styles.digitBadgeText}>
                  {(String(d.digit || '').match(/(\d+)/) || ['?'])[0]}
                </Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.digitTitle}>{String(d.digit || '')}</Text>
                <Text style={styles.digitMeaning}>{String(d.meaning || '')}</Text>
              </View>
            </View>
          ))}
        </>
      )}
      {!!data.negativeNumbers && (
        <Callout tone="warn" icon="alert-circle">{String(data.negativeNumbers)}</Callout>
      )}
      {!!data.pairsOfThree && <Callout icon="information-circle">{String(data.pairsOfThree)}</Callout>}
    </SectionCard>
  );
}

/** Lucky colours / days / directions — inherently a set of chips, not prose. */
export function LuckyThings({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  const lt = isObj(data) ? (isObj(data.luckyThings) ? data.luckyThings : data) : null;
  if (!lt) return null;
  const heading = title || t('report.luckyForYou');

  // The payload nests {label, value} pairs two levels deep under themed groups.
  const pairs = [];
  for (const group of Object.values(lt)) {
    if (!isObj(group)) continue;
    for (const entry of Object.values(group)) {
      if (isObj(entry) && entry.label && entry.value) {
        pairs.push({label: humanize(String(entry.label).toLowerCase()), value: String(entry.value)});
      }
    }
  }
  const singles = [
    {label: t('report.rulingPlanet'), value: lt.ruler, glyph: PLANET_GLYPH[lt.ruler] || '✦'},
    {label: t('report.element'), value: lt.element, glyph: '◆'},
    {label: t('report.sunSign'), value: lt.sunSign, glyph: ZODIAC_GLYPH[lt.sunSign] || '☉'},
    {label: t('report.bestTime'), value: lt.best_time_of_the_day, glyph: '◷'},
  ].filter((s) => s.value);

  return (
    <SectionCard title={heading} glyph="★" index={index}>
      {!!singles.length && (
        <View style={styles.signRow}>
          {singles.map((s) => (
            <View key={s.label} style={styles.signCard}>
              <Text style={styles.signGlyph}>{s.glyph}</Text>
              <Text style={styles.signValue}>{s.value}</Text>
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
        <><Divider /><PillRow label={t('report.traits')} items={lt.traits} /></>
      )}
      {Array.isArray(lt.favourable_periods) && !!lt.favourable_periods.length && (
        <PillRow label={t('report.favourablePeriods')} items={lt.favourable_periods} tone="good" />
      )}
      {!!data?.description && <><Divider /><Prose>{String(data.description)}</Prose></>}
    </SectionCard>
  );
}

/** Personal-year forecast. */
export function PersonalYear({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  if (!isObj(data)) return null;
  const heading = title || 'Personal Year';
  const year = trailingNumber(data.personalYear);
  const desc = isObj(data.description) ? data.description : null;
  const luck = isObj(data.luckFactorDetails) ? data.luckFactorDetails : null;
  const luckLines = luck ? asList(luck.descriptions) : [];
  const luckPct = (String(luckLines[0] || '').match(/(\d+)\s*%/) || [])[1];

  return (
    <SectionCard title={heading} glyph="◷" index={index}>
      <View style={styles.pyHero}>
        {!!year && (
          <RingGauge value={Number(year)} max={9} label={t('report.personalYearLabel') || heading} size={moderateScale(104)} />
        )}
        <View style={{flex: 1, marginLeft: scale(12)}}>
          {!!desc?.title && <Text style={styles.pyTitle}>{desc.title}</Text>}
          {!!data.personalYear && <Text style={styles.sourceLine}>{String(data.personalYear)}</Text>}
          {!!luckPct && (
            <View style={{marginTop: verticalScale(6)}}>
              <ScoreBar label={t('report.luckFactor')} value={Number(luckPct)} max={100} />
            </View>
          )}
        </View>
      </View>
      {!!luck?.title && <Text style={styles.sourceLine}>{String(luck.title)}</Text>}
      {luckLines.slice(1).map((l, i) => <Text key={i} style={styles.sourceLine}>{String(l)}</Text>)}
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
 * The payload is [{sign, sign_name, planet[], planet_small[]}] × 12 — a chart in list form.
 * The shipped app printed "Sign 1 / Sign Name Aries / PLANET • SUN • MERCURY…" down the
 * screen, so the reader had to hold twelve houses in their head to picture it. A grid IS
 * the picture.
 */
export function LalKitabHoroscope({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  const heading = title || t('report.lalKitabChart');
  const houses = Array.isArray(data) ? data.filter(isObj) : [];
  if (!houses.length) {
    return <SectionCard title={heading} glyph="📕" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  return (
    <SectionCard title={heading} glyph="📕" subtitle={t('report.planetsBySign')} index={index}>
      <View style={styles.hGrid}>
        {houses.map((h, i) => {
          const planets = asList(h.planet);
          const small = asList(h.planet_small);
          return (
            <View key={i} style={styles.hCell}>
              <View style={[styles.hCellInner, planets.length ? styles.hCellOccupied : null]}>
                <View style={styles.hCellTop}>
                  <Text style={styles.hCellNum}>{h.sign ?? i + 1}</Text>
                  <Text style={styles.hCellGlyph}>{ZODIAC_GLYPH[h.sign_name] || ''}</Text>
                </View>
                <Text style={styles.hCellName}>{h.sign_name || '—'}</Text>
                <View style={styles.hCellPlanets}>
                  {planets.length ? planets.map((p, pi) => (
                    <View key={pi} style={styles.hPlanet}>
                      <Text style={styles.hPlanetText}>
                        {SHORT_PLANET[p] || small[pi] || p}
                      </Text>
                    </View>
                  )) : <Text style={styles.hEmpty}>—</Text>}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
}

/** The 12 khanas with their lords, exalted and debilitated planets. */
export function LalKitabHouses({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  const heading = title || t('report.housesKhana');
  const rows = Array.isArray(data) ? data.filter(isObj) : [];
  if (!rows.length) {
    return <SectionCard title={heading} glyph="⌂" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }

  return (
    <SectionCard title={heading} glyph="⌂" subtitle={t('report.khanas', {count: rows.length})} index={index}>
      {rows.map((h, i) => (
        <View key={i} style={styles.khana}>
          <View style={styles.khanaNum}>
            <Text style={styles.khanaNumText}>{h.khana_number ?? i + 1}</Text>
          </View>
          <View style={{flex: 1}}>
            <View style={styles.khanaTop}>
              <Text style={styles.khanaOwner}>
                {t('report.lord')}: <Text style={styles.khanaOwnerVal}>{h.maalik || '—'}</Text>
              </Text>
              {h.soya === true && (
                <View style={styles.sleepBadge}>
                  <Text style={styles.sleepBadgeText}>{t('report.sleeping')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.khanaSub}>
              {t('report.pakkaGhar')}: {h.pakka_ghar || '—'}   ·   {t('report.kismat')}: {h.kismat || '—'}
            </Text>
            <PillRow items={asList(h.exalt).map((p) => `↑ ${p}`)} tone="good" />
            <PillRow items={asList(h.debilitated).map((p) => `↓ ${p}`)} tone="bad" />
          </View>
        </View>
      ))}
    </SectionCard>
  );
}

/** Per-planet effects + remedies, one collapsible each. */
export function LalKitabRemedies({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  const heading = title || t('report.planetRemedies');
  if (!isObj(data)) {
    return <SectionCard title={heading} glyph="✚" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const entries = Object.entries(data).filter(([, v]) => isObj(v) && (v.effects || v.remedies));
  if (!entries.length) {
    return <SectionCard title={heading} glyph="✚" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }

  return (
    <SectionCard title={heading} glyph="✚" subtitle={t('report.tapPlanet')} index={index}>
      {entries.map(([k, v]) => {
        const remedies = asList(v.remedies);
        const houseNo = ROMAN_HOUSE[v.house] || v.house;
        return (
          <Collapsible
            key={k}
            title={`${v.planet || humanize(k)}${houseNo ? ` · ${t('report.house')} ${houseNo}` : ''}`}
            count={remedies.length || undefined}
            glyph={PLANET_GLYPH[v.planet] || PLANET_GLYPH[humanize(k)] || '✦'}>
            {!!v.effects && (
              <View style={{marginBottom: verticalScale(8)}}>
                <Text style={styles.subLabel}>{t('report.effects')}</Text>
                <Prose>{String(v.effects)}</Prose>
              </View>
            )}
            {!!remedies.length && (
              <>
                <Text style={styles.subLabel}>{t('report.remedies')}</Text>
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
export function LalKitabDebts({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  const heading = title || t('report.karmicDebts');
  const rows = Array.isArray(data) ? data.filter(isObj) : [];
  if (!rows.length) {
    return (
      <SectionCard title={heading} glyph="⚖" index={index}>
        <Callout tone="good" icon="shield-checkmark">{t('report.noDebts')}</Callout>
      </SectionCard>
    );
  }
  return (
    <SectionCard title={heading} glyph="⚖" subtitle={t('report.found', {count: rows.length})} index={index}>
      {rows.map((d, i) => (
        <View key={i} style={styles.debt}>
          <View style={styles.debtHead}>
            <Ionicons name="alert-circle" size={moderateScale(16)} color={ASTRO.warn} />
            <Text style={styles.debtName}>{d.debt_name || `${t('report.karmicDebts')} ${i + 1}`}</Text>
          </View>
          {!!d.planetory && <Prose>{String(d.planetory)}</Prose>}
          {!!asList(d.indications).length && (
            <Collapsible title={t('report.indications')} count={asList(d.indications).length} glyph="◈">
              <NumberedList items={asList(d.indications)} tone="maroon" />
            </Collapsible>
          )}
          {!!asList(d.events).length && (
            <Collapsible title={t('report.possibleEvents')} count={asList(d.events).length} glyph="◷">
              <NumberedList items={asList(d.events)} tone="maroon" />
            </Collapsible>
          )}
          {!!asList(d.remedies).length && (
            <Collapsible title={t('report.remedies')} count={asList(d.remedies).length} glyph="✚">
              <NumberedList items={asList(d.remedies)} />
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
export function KpCusps({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  const heading = title || 'Cusp Details';
  const rows = Array.isArray(data) ? data.filter(isObj) : [];
  if (!rows.length) {
    return <SectionCard title={heading} glyph="◑" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  return (
    <SectionCard title={heading} glyph="◑" subtitle={t('report.cuspSub')} index={index}>
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
              <CuspLord label={t('report.sign')} value={c.signLord} />
              <CuspLord label={t('report.star')} value={c.nakshatraLord} />
              <CuspLord label={t('report.nakshatra')} value={c.nakshatra} />
              <CuspLord label={t('report.sub')} value={c.subLord} />
              <CuspLord label={t('report.subSub')} value={c.subSubLord} />
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

/** House significators — {1: [planets], …}. Rendered house by house. */
export function KpSignificators({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  const heading = title || 'House Significators';
  if (!isObj(data)) {
    return <SectionCard title={heading} glyph="⌂" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  const houses = Object.keys(data).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  if (!houses.length) {
    return <SectionCard title={heading} glyph="⌂" index={index}><GenericKeyVals data={data} /></SectionCard>;
  }
  return (
    <SectionCard title={heading} glyph="⌂" subtitle={t('report.significatorsSub')} index={index}>
      {houses.map((h) => (
        <View key={h} style={styles.sigRow}>
          <View style={styles.sigNum}>
            <Text style={styles.sigNumText}>{h}</Text>
          </View>
          <View style={styles.sigPlanets}>
            {asList(data[h]).map((p, i) => (
              <View key={i} style={styles.sigPlanet}>
                <Text style={styles.sigPlanetGlyph}>{PLANET_GLYPH[p] || '✦'}</Text>
                <Text style={styles.sigPlanetText}>{String(p)}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Ascendant report                                                     */
/* ------------------------------------------------------------------ */

/**
 * The ascendant payload is the richest prose in the kundli report — qualities, a gem, a
 * fasting day and a gayatri mantra alongside two predictions — and all of it was
 * collapsing into a single grey paragraph. Broken out into things a reader can pick up.
 */
export function AscendantReport({data, title, index = 0}) {
  const {t} = useContext(LanguageContext);
  const rows = Array.isArray(data) ? data.filter(isObj) : data ? [data] : [];
  if (!rows.length) return null;
  const r = rows[0];
  const heading = title || t('report.ascendant');
  const split = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

  return (
    <SectionCard
      title={heading}
      glyph={ZODIAC_GLYPH[r.ascendant] || '↑'}
      subtitle={[r.ascendant, r.symbol].filter(Boolean).join(' · ') || undefined}
      index={index}>
      <View style={styles.signRow}>
        {!!r.ascendant_lord && (
          <View style={styles.signCard}>
            <Text style={styles.signGlyph}>{PLANET_GLYPH[r.ascendant_lord] || '✦'}</Text>
            <Text style={styles.signValue}>{r.ascendant_lord}</Text>
            <Text style={styles.signLabel}>{t('report.lagnaLord')}</Text>
          </View>
        )}
        {!!r.ascendant_lord_house_location && (
          <View style={styles.signCard}>
            <Text style={styles.signGlyph}>⌂</Text>
            <Text style={styles.signValue}>{t('report.house')} {r.ascendant_lord_house_location}</Text>
            <Text style={styles.signLabel}>{t('report.placedIn')}</Text>
          </View>
        )}
        {!!r.ascendant_lord_strength && (
          <View style={styles.signCard}>
            <Text style={styles.signGlyph}>◆</Text>
            <Text
              style={[
                styles.signValue,
                {color: /strong|प्रबल|मजबूत/i.test(r.ascendant_lord_strength) ? ASTRO.good : ASTRO.warn},
              ]}>
              {r.ascendant_lord_strength}
            </Text>
            <Text style={styles.signLabel}>{t('report.strength')}</Text>
          </View>
        )}
      </View>

      {!!r.verbal_location && <Text style={styles.sourceLine}>{String(r.verbal_location)}</Text>}
      {!!r.general_prediction && <><Divider /><Prose>{String(r.general_prediction)}</Prose></>}
      {!!r.personalised_prediction && (
        <>
          <Divider />
          <Text style={styles.subLabel}>{t('report.forYouSpecifically')}</Text>
          <Prose>{String(r.personalised_prediction)}</Prose>
        </>
      )}

      {(!!r.good_qualities || !!r.bad_qualities) && (
        <>
          <Divider />
          <PillRow label={t('report.strengths')} items={split(r.good_qualities)} tone="good" />
          <PillRow label={t('report.watchOutFor')} items={split(r.bad_qualities)} tone="bad" />
        </>
      )}

      {(!!r.lucky_gem || !!r.day_for_fasting || !!r.zodiac_characteristics) && (
        <>
          <Divider />
          <ChipGrid
            items={[
              {label: t('report.luckyGem'), value: r.lucky_gem},
              {label: t('report.fastingDay'), value: r.day_for_fasting},
              {label: t('report.nature'), value: r.zodiac_characteristics},
            ]}
          />
        </>
      )}

      {!!r.gayatri_mantra && (
        <Collapsible title={t('report.gayatriMantra')} glyph="ॐ">
          <Text style={styles.mantra}>{String(r.gayatri_mantra)}</Text>
        </Collapsible>
      )}
      {!!r.flagship_qualities && (
        <Collapsible title={t('report.flagshipQualities')} glyph="★">
          <Prose>{String(r.flagship_qualities)}</Prose>
        </Collapsible>
      )}
      {!!r.spirituality_advice && (
        <Collapsible title={t('report.spiritualGuidance')} glyph="✦">
          <Prose>{String(r.spirituality_advice)}</Prose>
        </Collapsible>
      )}

      {rows.length > 1 && (
        <Collapsible title={t('report.additionalReadings')} count={rows.length - 1} glyph="◈">
          {rows.slice(1).map((extra, i) => (
            <View key={i} style={{marginBottom: verticalScale(8)}}>
              <GenericKeyVals data={extra} />
            </View>
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
  // Verbatim API sentence kept beneath a headline tile — see rule 1 at the top.
  sourceLine: {
    fontSize: moderateScale(10.5), lineHeight: moderateScale(16), fontFamily: 'Lato-Regular',
    color: ASTRO.muted, marginTop: verticalScale(3),
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
  signRow: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -scale(4)},
  signCard: {
    flexGrow: 1, flexBasis: '28%', margin: scale(4), backgroundColor: COLORS.white,
    borderRadius: moderateScale(10), borderWidth: 1, borderColor: ASTRO.line,
    alignItems: 'center', paddingVertical: verticalScale(10), paddingHorizontal: scale(4),
  },
  signGlyph: {fontSize: moderateScale(22), color: ASTRO.gold},
  signValue: {
    fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.ink,
    marginTop: 3, textAlign: 'center',
  },
  signLabel: {
    fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1, textAlign: 'center',
  },

  stoneRow: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -scale(4)},
  stone: {
    flexGrow: 1, flexBasis: '28%', margin: scale(4), backgroundColor: '#FFFBF1',
    borderRadius: moderateScale(10), borderWidth: 1, borderColor: ASTRO.goldSoft,
    alignItems: 'center', paddingVertical: verticalScale(9),
  },
  stoneGlyph: {fontSize: moderateScale(17), color: ASTRO.gold},
  stoneValue: {
    fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    marginTop: 2, textAlign: 'center',
  },
  stoneLabel: {
    fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    textTransform: 'uppercase', textAlign: 'center',
  },

  /* dosha */
  verdictHero: {flexDirection: 'row', alignItems: 'center'},
  verdictIconBox: {width: moderateScale(76), alignItems: 'center', justifyContent: 'center'},
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
    width: scale(9), height: scale(9), borderRadius: scale(5), backgroundColor: ASTRO.line,
    marginTop: verticalScale(5), borderWidth: 2, borderColor: ASTRO.parchment,
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
    fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    textAlign: 'center', marginBottom: verticalScale(8),
  },
  sumRow: {flexDirection: 'row', alignItems: 'center'},
  digitRow: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: verticalScale(8)},
  digitBadge: {
    width: moderateScale(28), height: moderateScale(28), borderRadius: moderateScale(14),
    backgroundColor: ASTRO.goldSoft, alignItems: 'center', justifyContent: 'center', marginRight: scale(9),
  },
  digitBadgeText: {fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  digitTitle: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  digitMeaning: {fontSize: moderateScale(12), fontFamily: 'Lato-Regular', color: ASTRO.ink},
  pyHero: {flexDirection: 'row', alignItems: 'center'},
  pyTitle: {fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: ASTRO.maroon},

  verdictLineRow: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: verticalScale(8)},
  verdictKey: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  verdictText: {fontSize: moderateScale(11.5), fontFamily: 'Lato-Regular', color: ASTRO.ink, lineHeight: moderateScale(17)},

  /* lal kitab 12-house grid */
  hGrid: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -scale(3)},
  hCell: {width: '33.33%', padding: scale(3)},
  hCellInner: {
    borderWidth: 1, borderColor: ASTRO.line, borderRadius: moderateScale(8),
    backgroundColor: COLORS.white, padding: scale(6), minHeight: verticalScale(70),
  },
  hCellOccupied: {backgroundColor: '#FFFBF1', borderColor: ASTRO.goldSoft},
  hCellTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  hCellNum: {fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: ASTRO.muted},
  hCellGlyph: {fontSize: moderateScale(13), color: ASTRO.gold},
  hCellName: {fontSize: moderateScale(10.5), fontFamily: 'Lato-Bold', color: ASTRO.ink, marginTop: 1},
  hCellPlanets: {flexDirection: 'row', flexWrap: 'wrap', marginTop: verticalScale(4)},
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

  debt: {
    borderWidth: 1, borderColor: ASTRO.line, borderRadius: moderateScale(10),
    backgroundColor: '#FFFDF7', padding: scale(10), marginBottom: verticalScale(9),
  },
  debtHead: {flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(5)},
  debtName: {fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: ASTRO.maroon, marginLeft: scale(6), flex: 1},

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
