// Shared visual primitives for astrology reports and free services.
//
// WHY: every paid report used to render through one recursive key/value dumper
// (ReportResultView). The original author had no live API access and defensively
// printed whatever came back, so a customer paying ₹99 received a wall of
// "Label: value" text — no charts, no hierarchy, nothing that reads as an
// astrology report. The API actually returns richly structured data (per-planet
// positions, koota scores out of a maximum, dosha verdicts with numeric scores,
// dasha date ranges, numerology plane percentages); it was all being flattened.
//
// These primitives give every screen one consistent language: a warm parchment
// surface, maroon/gold brand accents, and real visual encodings (bars, rings,
// badges, tables) instead of prose. Blocks built on them live in AstroBlocks.js.
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';

// Palette extends the brand (AstroMaroon / AstroSoftOrange / AstroGold) with the
// semantic colours these reports need. Kept here so every block agrees.
export const ASTRO = {
  maroon: COLORS.AstroMaroon,
  maroonSoft: '#7a4630',
  parchment: '#FFF8EF',
  parchmentDeep: '#F7E8D3',
  gold: '#C9962C',
  goldSoft: '#F2E0B8',
  ink: '#2E1B12',
  muted: '#8A7566',
  line: '#E7D6C2',
  good: '#2E7D32',
  warn: '#E67E22',
  bad: '#C0392B',
};

// Unicode glyphs — authentic astrological symbols with no image assets to ship
// or fail to load.
export const ZODIAC_GLYPH = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋', Leo: '♌', Virgo: '♍',
  Libra: '♎', Scorpio: '♏', Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
};

export const PLANET_GLYPH = {
  Sun: '☉', Moon: '☽', Mars: '♂', Mercury: '☿', Jupiter: '♃', Venus: '♀',
  Saturn: '♄', Rahu: '☊', Ketu: '☋', Ascendant: '↑', As: '↑', Uranus: '♅',
  Neptune: '♆', Pluto: '♇',
};

export function humanize(key) {
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Page wrapper for a report or service result. Gives every screen the same
 * parchment ground and bottom padding, plus an optional title banner, so the
 * set reads as one product instead of nine differently-shaped lists.
 */
export function ReportShell({title, subtitle, children}) {
  return (
    <View style={styles.shell}>
      {!!title && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.bannerSub}>{subtitle}</Text>}
        </View>
      )}
      {children}
    </View>
  );
}

/** Section container: gold-ruled header + parchment body. */
export function SectionCard({title, subtitle, glyph, children, style}) {
  return (
    <View style={[styles.card, style]}>
      {(title || glyph) && (
        <View style={styles.cardHeader}>
          {!!glyph && <Text style={styles.cardGlyph}>{glyph}</Text>}
          <View style={{flex: 1}}>
            <Text style={styles.cardTitle}>{title}</Text>
            {!!subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
          </View>
        </View>
      )}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

/** Big single figure — the headline number of a report. */
export function StatTile({label, value, hint, tone = 'default'}) {
  const toneColor =
    tone === 'good' ? ASTRO.good : tone === 'bad' ? ASTRO.bad : tone === 'warn' ? ASTRO.warn : ASTRO.maroon;
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, {color: toneColor}]} numberOfLines={1}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {!!hint && <Text style={styles.tileHint}>{hint}</Text>}
    </View>
  );
}

export function TileRow({children}) {
  return <View style={styles.tileRow}>{children}</View>;
}

/**
 * Horizontal score bar. Encodes value/max as width so a reader takes in the
 * whole picture at a glance instead of comparing numbers in prose.
 */
export function ScoreBar({label, value, max, caption}) {
  const v = Number(value) || 0;
  const m = Number(max) || 0;
  const pct = m > 0 ? Math.max(0, Math.min(1, v / m)) : 0;
  const tone = pct >= 0.7 ? ASTRO.good : pct >= 0.4 ? ASTRO.warn : ASTRO.bad;
  return (
    <View style={styles.barWrap}>
      <View style={styles.barTop}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValue}>{m ? `${v} / ${m}` : String(v)}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, {width: `${pct * 100}%`, backgroundColor: tone}]} />
      </View>
      {!!caption && <Text style={styles.barCaption}>{caption}</Text>}
    </View>
  );
}

/** Coloured verdict pill — "Present" / "Not Present" and similar. */
export function Badge({text, tone = 'default'}) {
  const bg =
    tone === 'good' ? '#E8F5E9' : tone === 'bad' ? '#FDECEA' : tone === 'warn' ? '#FFF4E5' : ASTRO.goldSoft;
  const fg =
    tone === 'good' ? ASTRO.good : tone === 'bad' ? ASTRO.bad : tone === 'warn' ? ASTRO.warn : ASTRO.maroon;
  return (
    <View style={[styles.badge, {backgroundColor: bg}]}>
      <Text style={[styles.badgeText, {color: fg}]}>{text}</Text>
    </View>
  );
}

/** Compact chip for a single attribute (Gana, Yoni, Nadi…). */
export function Chip({label, value}) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue} numberOfLines={2}>{value ?? '—'}</Text>
    </View>
  );
}

export function ChipGrid({items}) {
  const shown = (items || []).filter((i) => i.value !== undefined && i.value !== null && i.value !== '');
  if (!shown.length) return null;
  return (
    <View style={styles.chipGrid}>
      {shown.map((i) => <Chip key={i.label} label={i.label} value={i.value} />)}
    </View>
  );
}

/** Paragraph of interpretation text from the API. */
export function Prose({children}) {
  if (!children) return null;
  return <Text style={styles.prose}>{children}</Text>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

/** Simple label/value line for the handful of fields with no richer treatment. */
export function KeyVal({label, value}) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {paddingTop: verticalScale(12), paddingBottom: verticalScale(28)},
  banner: {
    marginHorizontal: scale(14),
    marginBottom: verticalScale(12),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(14),
    borderRadius: moderateScale(14),
    backgroundColor: ASTRO.maroon,
  },
  bannerTitle: {fontSize: moderateScale(17), fontFamily: 'Lato-Bold', color: COLORS.white},
  bannerSub: {fontSize: moderateScale(11), fontFamily: 'Lato-Regular', color: ASTRO.goldSoft, marginTop: 2},
  card: {
    backgroundColor: ASTRO.parchment,
    borderRadius: moderateScale(14),
    borderWidth: 1,
    borderColor: ASTRO.line,
    marginHorizontal: scale(14),
    marginBottom: verticalScale(14),
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ASTRO.parchmentDeep,
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(9),
    borderBottomWidth: 1,
    borderBottomColor: ASTRO.line,
  },
  cardGlyph: {fontSize: moderateScale(18), color: ASTRO.gold, marginRight: scale(8)},
  cardTitle: {fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  cardSubtitle: {fontSize: moderateScale(11), fontFamily: 'Lato-Regular', color: ASTRO.muted, marginTop: 1},
  cardBody: {padding: scale(12)},

  tileRow: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -scale(4)},
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    margin: scale(4),
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(10),
    borderWidth: 1,
    borderColor: ASTRO.line,
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(8),
    alignItems: 'center',
  },
  tileValue: {fontSize: moderateScale(18), fontFamily: 'Lato-Bold'},
  tileLabel: {fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: ASTRO.muted, marginTop: 2, textAlign: 'center'},
  tileHint: {fontSize: moderateScale(9), fontFamily: 'Lato-Regular', color: ASTRO.muted, textAlign: 'center'},

  barWrap: {marginBottom: verticalScale(10)},
  barTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 3},
  barLabel: {fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.ink},
  barValue: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  barTrack: {height: verticalScale(7), borderRadius: 20, backgroundColor: ASTRO.parchmentDeep, overflow: 'hidden'},
  barFill: {height: '100%', borderRadius: 20},
  barCaption: {fontSize: moderateScale(10), fontFamily: 'Lato-Regular', color: ASTRO.muted, marginTop: 2},

  badge: {paddingHorizontal: scale(9), paddingVertical: verticalScale(3), borderRadius: 20, alignSelf: 'flex-start'},
  badgeText: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold'},

  chipGrid: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -scale(3)},
  chip: {
    flexGrow: 1,
    flexBasis: '28%',
    margin: scale(3),
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(8),
    borderWidth: 1,
    borderColor: ASTRO.line,
    paddingVertical: verticalScale(7),
    paddingHorizontal: scale(7),
  },
  chipLabel: {fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.muted, textTransform: 'uppercase'},
  chipValue: {fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.ink, marginTop: 1},

  prose: {fontSize: moderateScale(12), lineHeight: moderateScale(19), fontFamily: 'Lato-Regular', color: ASTRO.ink},
  divider: {height: 1, backgroundColor: ASTRO.line, marginVertical: verticalScale(9)},

  kv: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: verticalScale(4)},
  kvLabel: {flex: 1, fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.muted},
  kvValue: {flex: 1, fontSize: moderateScale(12), fontFamily: 'Lato-Regular', color: ASTRO.ink, textAlign: 'right'},
});
