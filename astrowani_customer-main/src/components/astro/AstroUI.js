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
import React, {useEffect, useRef, useState} from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, TouchableOpacity, LayoutAnimation,
  Platform, UIManager, ScrollView,
} from 'react-native';
import Svg, {Circle, G} from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {LanguageContext} from '../../context/LanguageContext';
import {captureEvent} from '../../utils/Analytics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
//
// The Devanagari keys are NOT decoration: when a report is fetched with lang=hi the API
// returns sign and planet names in Hindi ("कर्क", "चंद्रमा"), so an English-only map
// silently drops every glyph the moment a reader switches language. Verified against live
// lang=hi responses 2026-08-16.
export const ZODIAC_GLYPH = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋', Leo: '♌', Virgo: '♍',
  Libra: '♎', Scorpio: '♏', Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
  // Hindi
  'मेष': '♈', 'वृषभ': '♉', 'वृष': '♉', 'मिथुन': '♊', 'कर्क': '♋', 'सिंह': '♌',
  'कन्या': '♍', 'तुला': '♎', 'वृश्चिक': '♏', 'धनु': '♐', 'मकर': '♑',
  'कुंभ': '♒', 'कुम्भ': '♒', 'मीन': '♓',
};

export const PLANET_GLYPH = {
  Sun: '☉', Moon: '☽', Mars: '♂', Mercury: '☿', Jupiter: '♃', Venus: '♀',
  Saturn: '♄', Rahu: '☊', Ketu: '☋', Ascendant: '↑', As: '↑', Uranus: '♅',
  Neptune: '♆', Pluto: '♇',
  // The API also emits these upper-case forms (Lal Kitab) and Rahu/Ketu as a pair.
  SUN: '☉', MOON: '☽', MARS: '♂', MERCURY: '☿', JUPITER: '♃', VENUS: '♀',
  SATURN: '♄', RAHU: '☊', KETU: '☋', 'Rahu/Ketu': '☊',
  // Hindi
  'सूर्य': '☉', 'चंद्रमा': '☽', 'चंद्र': '☽', 'चन्द्र': '☽', 'मंगल': '♂',
  'बुध': '☿', 'गुरु': '♃', 'बृहस्पति': '♃', 'शुक्र': '♀', 'शनि': '♄',
  'राहु': '☊', 'केतु': '☋', 'राहु/केतु': '☊', 'लग्न': '↑',
};

export function humanize(key) {
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Page wrapper for a report or service result. Gives every screen the same
 * parchment ground and bottom padding, plus an optional title banner, so the
 * set reads as one product instead of nine differently-shaped lists.
 */
export function ReportShell({title, subtitle, children, consult = true}) {
  return (
    <View style={styles.shell}>
      {!!title && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.bannerSub}>{subtitle}</Text>}
        </View>
      )}
      {children}
      {/* Every report ends on the same question — "so what does this mean for
          me?" — which is the moment to offer a real astrologer. Pass
          consult={false} on a screen where the reader has not reached a result
          yet (an input form, an error state). */}
      {consult && <ConsultCta source="report" />}
    </View>
  );
}

/**
 * The "talk to a real astrologer" call to action that closes every report and
 * ₹1 service result.
 *
 * Navigation is deliberately the FULL nested path
 * (DrawerNavigator → BottomTabs → tab) rather than a bare navigate('Chat').
 * Most of these screens are registered on the ROOT stack, and React Navigation
 * only bubbles an action UP the tree — it never searches back down into a
 * sibling navigator. From a root-stack screen, navigate('Chat') therefore
 * reaches the root stack, finds no route by that name, and is dropped with
 * nothing but a dev-only warning. That is exactly what the first version of
 * this button (inline in KundaliMatchingReport) did: it looked fine and did
 * nothing.
 */
export function ConsultCta({source = 'report', style}) {
  const {t} = React.useContext(LanguageContext);
  const navigation = useNavigation();

  const go = (tab) => {
    captureEvent('consult_cta_click', {source, target: tab});
    navigation.navigate('DrawerNavigator', {
      screen: 'BottomTabs',
      params: {screen: tab},
    });
  };

  return (
    <Reveal style={style}>
      <View style={styles.consultCard}>
        <View style={styles.consultHead}>
          <View style={styles.consultGlyphBadge}>
            <Ionicons name="sparkles" size={moderateScale(15)} color={ASTRO.maroon} />
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.consultTitle}>{t('consult.title')}</Text>
            <Text style={styles.consultSub}>{t('consult.subtitle')}</Text>
          </View>
        </View>
        <View style={styles.consultRow}>
          <TouchableOpacity
            style={[styles.consultBtn, styles.consultBtnPrimary]}
            activeOpacity={0.85}
            onPress={() => go('Chat')}>
            <Ionicons name="chatbubble-ellipses" size={moderateScale(15)} color={COLORS.white} />
            <Text style={styles.consultBtnTextPrimary}>{t('consult.chat')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.consultBtn, styles.consultBtnGhost]}
            activeOpacity={0.85}
            onPress={() => go('Call')}>
            <Ionicons name="call" size={moderateScale(15)} color={ASTRO.maroon} />
            <Text style={styles.consultBtnTextGhost}>{t('consult.call')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Reveal>
  );
}

/** Section container: gold-ruled header + parchment body, revealed on mount. */
export function SectionCard({title, subtitle, glyph, children, style, index = 0, noPad}) {
  return (
    <Reveal index={index}>
      <View style={[styles.card, style]}>
        {(title || glyph) && (
          <View style={styles.cardHeader}>
            {!!glyph && (
              <View style={styles.cardGlyphBadge}>
                <Text style={styles.cardGlyph}>{glyph}</Text>
              </View>
            )}
            <View style={{flex: 1}}>
              <Text style={styles.cardTitle}>{title}</Text>
              {!!subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
            </View>
          </View>
        )}
        <View style={noPad ? null : styles.cardBody}>{children}</View>
      </View>
    </Reveal>
  );
}

/** Big single figure — the headline number of a report. */
export function StatTile({label, value, hint, tone = 'default'}) {
  const toneColor =
    tone === 'good' ? ASTRO.good : tone === 'bad' ? ASTRO.bad : tone === 'warn' ? ASTRO.warn : ASTRO.maroon;
  return (
    <View style={styles.tile}>
      {/* No numberOfLines: values here can be a gemstone name or a list, and clipping
          them would silently drop text the customer paid for. */}
      <Text style={[styles.tileValue, {color: toneColor}]}>{value}</Text>
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
 *
 * The fill animates in: a bar that grows draws the eye to it and makes the
 * relative lengths land as a comparison rather than as decoration. Staggered by
 * `index` so a list of eight kootas fills in sequence instead of all at once.
 */
export function ScoreBar({label, value, max, caption, index = 0}) {
  const v = Number(value) || 0;
  const m = Number(max) || 0;
  const pct = m > 0 ? Math.max(0, Math.min(1, v / m)) : 0;
  const tone = pct >= 0.7 ? ASTRO.good : pct >= 0.4 ? ASTRO.warn : ASTRO.bad;
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(grow, {
      toValue: pct,
      duration: 620,
      delay: Math.min(index, 10) * 70,
      easing: Easing.out(Easing.cubic),
      // Width is a layout prop — the native driver cannot animate it.
      useNativeDriver: false,
    }).start();
  }, [pct, index, grow]);

  const width = grow.interpolate({inputRange: [0, 1], outputRange: ['0%', '100%']});

  return (
    <View style={styles.barWrap}>
      <View style={styles.barTop}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={[styles.barValue, {color: tone}]}>{m ? `${v} / ${m}` : String(v)}</Text>
      </View>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, {width, backgroundColor: tone}]} />
      </View>
      {!!caption && <Text style={styles.barCaption}>{caption}</Text>}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Entrance animation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Fades and lifts its children in on mount. Applied to every section card so a
 * long report arrives in a readable rhythm instead of dumping as one wall — the
 * specific complaint about these screens was that nothing invited you to read.
 */
export function Reveal({children, index = 0, style}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      delay: Math.min(index, 8) * 80,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anim, index]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{translateY: anim.interpolate({inputRange: [0, 1], outputRange: [14, 0]})}],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Ring gauge                                                           */
/* ------------------------------------------------------------------ */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Circular gauge for the ONE headline number of a report — compatibility %,
 * dosha intensity, plane strength. A ring reads as "how much out of the whole"
 * instantly, which a bare "Score 53" never did.
 */
export function RingGauge({
  value, max = 100, label, caption, size = moderateScale(128), thickness = moderateScale(11), tone,
}) {
  const v = Number(value) || 0;
  const m = Number(max) || 100;
  const pct = m > 0 ? Math.max(0, Math.min(1, v / m)) : 0;
  const color = tone || (pct >= 0.7 ? ASTRO.good : pct >= 0.4 ? ASTRO.warn : ASTRO.bad);

  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const anim = useRef(new Animated.Value(circumference)).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: circumference * (1 - pct),
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Count the number up alongside the arc so the two read as one motion.
    const counter = new Animated.Value(0);
    const id = counter.addListener(({value: f}) => setShown(Math.round(f)));
    Animated.timing(counter, {
      toValue: v, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    return () => counter.removeListener(id);
  }, [pct, v, circumference, anim]);

  return (
    <View style={[styles.ringWrap, {width: size}]}>
      <View style={{width: size, height: size}}>
        <Svg width={size} height={size}>
          {/* -90° so the arc starts at 12 o'clock, the way a gauge is read. */}
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            <Circle
              cx={size / 2} cy={size / 2} r={r}
              stroke={ASTRO.parchmentDeep} strokeWidth={thickness} fill="none"
            />
            <AnimatedCircle
              cx={size / 2} cy={size / 2} r={r}
              stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={anim}
            />
          </G>
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
          <Text style={[styles.ringValue, {color, fontSize: size * 0.26}]}>{shown}</Text>
          {m !== 1 && <Text style={styles.ringMax}>/ {m}</Text>}
        </View>
      </View>
      {!!label && <Text style={styles.ringLabel}>{label}</Text>}
      {!!caption && <Text style={styles.ringCaption}>{caption}</Text>}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Collapsible                                                          */
/* ------------------------------------------------------------------ */

/**
 * Show-more container. The remedy lists from this API run to ten paragraphs
 * apiece and, printed in full, buried every other section of the report under
 * scroll. Collapsed by default with the count in the header, so the reader
 * chooses what to go deep on.
 */
export function Collapsible({title, count, children, defaultOpen = false, glyph}) {
  const [open, setOpen] = useState(defaultOpen);
  const spin = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    Animated.timing(spin, {
      toValue: open ? 0 : 1, duration: 200, useNativeDriver: true,
    }).start();
    setOpen(!open);
  };

  const rotate = spin.interpolate({inputRange: [0, 1], outputRange: ['0deg', '180deg']});

  return (
    <View style={styles.collapse}>
      <TouchableOpacity style={styles.collapseHead} onPress={toggle} activeOpacity={0.7}>
        {!!glyph && <Text style={styles.collapseGlyph}>{glyph}</Text>}
        <Text style={styles.collapseTitle}>{title}</Text>
        {count !== undefined && count !== null && (
          <View style={styles.collapseCount}>
            <Text style={styles.collapseCountText}>{count}</Text>
          </View>
        )}
        <Animated.View style={{transform: [{rotate}]}}>
          <Ionicons name="chevron-down" size={moderateScale(17)} color={ASTRO.maroon} />
        </Animated.View>
      </TouchableOpacity>
      {open && <View style={styles.collapseBody}>{children}</View>}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Numbered list — remedies, steps, factors                             */
/* ------------------------------------------------------------------ */

/**
 * Remedies as numbered cards. They were rendered as "• <paragraph>" bullets,
 * which at ten items of four lines each is indistinguishable from a wall of
 * text. Numbering plus a card per item gives each remedy an edge to rest on.
 */
export function NumberedList({items, tone = 'gold'}) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  const dotBg = tone === 'maroon' ? ASTRO.maroon : ASTRO.gold;
  return (
    <View>
      {list.map((item, i) => (
        <View key={i} style={styles.numItem}>
          <View style={[styles.numDot, {backgroundColor: dotBg}]}>
            <Text style={styles.numDotText}>{i + 1}</Text>
          </View>
          <Text style={styles.numText}>
            {typeof item === 'string' ? item.trim() : JSON.stringify(item)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Two-party comparison                                                 */
/* ------------------------------------------------------------------ */

/**
 * Boy-vs-girl row for the matching report, which is full of {boy, girl} pairs.
 * These were printing as the literal strings "false"/"true" in two columns —
 * information the reader has to decode. A tick, a cross and a colour say it.
 */
export function CompareRow({label, left, right, invert = false, yesLabel = 'Yes', noLabel = 'No'}) {
  const cell = (raw) => {
    if (typeof raw === 'boolean') {
      // `invert` flags rows where "true" is the bad outcome (a dosha present).
      const good = invert ? !raw : raw;
      return {
        icon: raw ? 'close-circle' : 'checkmark-circle',
        color: good ? ASTRO.good : ASTRO.bad,
        text: raw ? yesLabel : noLabel,
      };
    }
    return {icon: null, color: ASTRO.ink, text: raw === undefined || raw === null ? '—' : String(raw)};
  };
  const l = cell(left);
  const r = cell(right);

  return (
    <View style={styles.cmpRow}>
      <Text style={styles.cmpLabel}>{label}</Text>
      <View style={styles.cmpCell}>
        {!!l.icon && <Ionicons name={l.icon} size={moderateScale(15)} color={l.color} />}
        <Text style={[styles.cmpValue, {color: l.color}]}>{l.text}</Text>
      </View>
      <View style={styles.cmpCell}>
        {!!r.icon && <Ionicons name={r.icon} size={moderateScale(15)} color={r.color} />}
        <Text style={[styles.cmpValue, {color: r.color}]}>{r.text}</Text>
      </View>
    </View>
  );
}

export function CompareHeader({leftName = 'Boy', rightName = 'Girl'}) {
  return (
    <View style={[styles.cmpRow, styles.cmpHead]}>
      <Text style={styles.cmpLabel} />
      <Text style={[styles.cmpHeadText, styles.cmpCell]}>♂ {leftName}</Text>
      <Text style={[styles.cmpHeadText, styles.cmpCell]}>♀ {rightName}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented tabs                                                       */
/* ------------------------------------------------------------------ */

/**
 * Tab bar with a sliding indicator.
 *
 * The ₹1 service screens each hand-rolled their own tab row — Horoscope Details, Shubh
 * Muhurat and Kundali Matching all had a different one, with different colours, none of
 * them matching the paid reports and none of them animated. One component now, so the
 * whole free-services set reads as the same product as the paid set.
 *
 * `scrollable` for four-plus tabs (Shubh Muhurat) where fixed thirds would truncate.
 */
export function SegmentedTabs({tabs, active, onChange, scrollable = false}) {
  const list = tabs || [];
  const idx = Math.max(0, list.findIndex((tb) => (tb.key ?? tb) === active));
  const slide = useRef(new Animated.Value(idx)).current;
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: idx, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [idx, slide]);

  const seg = list.length ? barWidth / list.length : 0;
  const translateX = slide.interpolate({
    inputRange: list.map((_, i) => i),
    outputRange: list.map((_, i) => i * seg),
    extrapolate: 'clamp',
  });

  const body = (
    <View
      style={[styles.tabsTrack, scrollable && styles.tabsTrackScroll]}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
      {/* Only the fixed-width layout can host a sliding pill — with a scrollable row the
          segment widths are content-driven and unknown until after layout. */}
      {!scrollable && barWidth > 0 && (
        <Animated.View style={[styles.tabsPill, {width: seg, transform: [{translateX}]}]} />
      )}
      {list.map((tb) => {
        const key = tb.key ?? tb;
        const label = tb.label ?? tb;
        const on = key === active;
        return (
          <TouchableOpacity
            key={key}
            activeOpacity={0.75}
            onPress={() => onChange(key)}
            style={[
              styles.tabsItem,
              scrollable && styles.tabsItemScroll,
              scrollable && on && styles.tabsItemScrollOn,
            ]}>
            <Text style={[styles.tabsLabel, on && styles.tabsLabelOn]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (!scrollable) return <View style={styles.tabsWrap}>{body}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // flexGrow/flexShrink 0 are LOAD-BEARING. A ScrollView inside a column flex
      // parent stretches along the main axis by default, so this horizontal tab
      // strip claimed most of the screen's height and pushed the content below it
      // off the bottom — the large empty band under the Shubh Muhurat tabs.
      style={styles.tabsScrollView}
      contentContainerStyle={styles.tabsScrollContent}>
      {body}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Callout                                                              */
/* ------------------------------------------------------------------ */

/** Tinted panel for the API's summary sentence — the one line worth reading first. */
export function Callout({children, tone = 'default', icon = 'sparkles'}) {
  if (!children) return null;
  const map = {
    good: {bg: '#EDF7ED', bd: '#CDE8CE', fg: ASTRO.good},
    bad: {bg: '#FDF0EE', bd: '#F3D2CC', fg: ASTRO.bad},
    warn: {bg: '#FFF6EA', bd: '#F6E0C0', fg: ASTRO.warn},
    default: {bg: '#FFFBF1', bd: ASTRO.goldSoft, fg: ASTRO.maroon},
  };
  const c = map[tone] || map.default;
  return (
    <View style={[styles.callout, {backgroundColor: c.bg, borderColor: c.bd}]}>
      <Ionicons name={icon} size={moderateScale(15)} color={c.fg} style={styles.calloutIcon} />
      <Text style={[styles.calloutText, {color: ASTRO.ink}]}>{children}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Labelled pill row (qualities, traits, lists of short words)          */
/* ------------------------------------------------------------------ */

/** Short strings as wrapping pills — far more scannable than a comma sentence. */
export function PillRow({items, tone = 'default', label}) {
  const list = (items || [])
    .map((s) => (typeof s === 'string' ? s.trim() : String(s ?? '')))
    .filter((s) => s && s !== '-');
  if (!list.length) return null;
  const bg = tone === 'good' ? '#EDF7ED' : tone === 'bad' ? '#FDF0EE' : ASTRO.goldSoft;
  const fg = tone === 'good' ? ASTRO.good : tone === 'bad' ? ASTRO.bad : ASTRO.maroon;
  return (
    <View style={{marginBottom: verticalScale(4)}}>
      {!!label && <Text style={styles.pillRowLabel}>{label}</Text>}
      <View style={styles.pillWrap}>
        {list.map((s, i) => (
          <View key={i} style={[styles.pill, {backgroundColor: bg}]}>
            <Text style={[styles.pillText, {color: fg}]}>{s}</Text>
          </View>
        ))}
      </View>
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
      <Text style={styles.chipValue}>{value ?? '—'}</Text>
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

  // Consult CTA. Deliberately NOT a SectionCard: it is an offer, not a section
  // of the report, so it carries the gold ground and dashed rule to read as a
  // footer rather than as one more thing to read.
  consultCard: {
    marginHorizontal: scale(15),
    marginTop: verticalScale(4),
    backgroundColor: ASTRO.goldSoft,
    borderRadius: moderateScale(14),
    borderWidth: 1,
    borderColor: ASTRO.gold,
    borderStyle: 'dashed',
    padding: scale(14),
  },
  consultHead: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: verticalScale(11)},
  consultGlyphBadge: {
    width: moderateScale(30), height: moderateScale(30), borderRadius: moderateScale(15),
    backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center',
    marginRight: scale(10), borderWidth: 1, borderColor: ASTRO.gold,
  },
  consultTitle: {fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: ASTRO.ink},
  consultSub: {
    fontSize: moderateScale(11), fontFamily: 'Lato-Regular', color: ASTRO.maroonSoft,
    marginTop: 2, lineHeight: verticalScale(15),
  },
  consultRow: {flexDirection: 'row'},
  consultBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: moderateScale(10), paddingVertical: verticalScale(10),
  },
  consultBtnPrimary: {backgroundColor: ASTRO.maroon, marginRight: scale(8)},
  consultBtnGhost: {backgroundColor: COLORS.white, borderWidth: 1, borderColor: ASTRO.maroon},
  consultBtnTextPrimary: {
    fontSize: moderateScale(12.5), fontFamily: 'Lato-Bold', color: COLORS.white, marginLeft: scale(6),
  },
  consultBtnTextGhost: {
    fontSize: moderateScale(12.5), fontFamily: 'Lato-Bold', color: ASTRO.maroon, marginLeft: scale(6),
  },
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
  cardGlyphBadge: {
    width: moderateScale(28), height: moderateScale(28), borderRadius: moderateScale(14),
    backgroundColor: ASTRO.goldSoft, alignItems: 'center', justifyContent: 'center',
    marginRight: scale(9),
  },
  cardGlyph: {fontSize: moderateScale(15), color: ASTRO.maroon},
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

  ringWrap: {alignItems: 'center'},
  ringCenter: {alignItems: 'center', justifyContent: 'center'},
  ringValue: {fontFamily: 'Lato-Bold', includeFontPadding: false},
  ringMax: {fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: ASTRO.muted, marginTop: -2},
  ringLabel: {
    fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    marginTop: verticalScale(7), textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4,
  },
  ringCaption: {
    fontSize: moderateScale(10), fontFamily: 'Lato-Regular', color: ASTRO.muted,
    textAlign: 'center', marginTop: 1,
  },

  collapse: {
    borderWidth: 1, borderColor: ASTRO.line, borderRadius: moderateScale(10),
    marginBottom: verticalScale(8), backgroundColor: COLORS.white, overflow: 'hidden',
  },
  collapseHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: scale(10), paddingVertical: verticalScale(9),
    backgroundColor: '#FFFDF7',
  },
  collapseGlyph: {fontSize: moderateScale(14), color: ASTRO.gold, marginRight: scale(7)},
  collapseTitle: {flex: 1, fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.ink},
  collapseCount: {
    minWidth: moderateScale(20), paddingHorizontal: scale(5), paddingVertical: 1,
    borderRadius: 20, backgroundColor: ASTRO.goldSoft, marginRight: scale(8), alignItems: 'center',
  },
  collapseCountText: {fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: ASTRO.maroon},
  collapseBody: {
    paddingHorizontal: scale(10), paddingTop: verticalScale(8), paddingBottom: verticalScale(4),
    borderTopWidth: 1, borderTopColor: ASTRO.line,
  },

  numItem: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: verticalScale(9)},
  numDot: {
    width: moderateScale(19), height: moderateScale(19), borderRadius: moderateScale(10),
    alignItems: 'center', justifyContent: 'center', marginRight: scale(8), marginTop: 1,
  },
  numDotText: {fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: COLORS.white},
  numText: {
    flex: 1, fontSize: moderateScale(12), lineHeight: moderateScale(19),
    fontFamily: 'Lato-Regular', color: ASTRO.ink,
  },

  cmpRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(7),
    borderBottomWidth: 1, borderBottomColor: ASTRO.line,
  },
  cmpHead: {borderBottomWidth: 1.5, borderBottomColor: ASTRO.goldSoft},
  cmpHeadText: {
    fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon, textAlign: 'center',
  },
  cmpLabel: {flex: 1.5, fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.muted},
  cmpCell: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  cmpValue: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', marginLeft: scale(4)},

  callout: {
    flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: moderateScale(10),
    padding: scale(10), marginBottom: verticalScale(8),
  },
  calloutIcon: {marginRight: scale(8), marginTop: 1},
  calloutText: {
    flex: 1, fontSize: moderateScale(12), lineHeight: moderateScale(19), fontFamily: 'Lato-Regular',
  },

  pillRowLabel: {
    fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: verticalScale(4),
  },
  pillWrap: {flexDirection: 'row', flexWrap: 'wrap', marginBottom: verticalScale(4)},
  pill: {
    paddingHorizontal: scale(9), paddingVertical: verticalScale(4), borderRadius: 20,
    marginRight: scale(5), marginBottom: verticalScale(5),
  },
  pillText: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold'},

  tabsWrap: {paddingHorizontal: scale(14), paddingTop: verticalScale(10)},
  tabsScrollView: {flexGrow: 0, flexShrink: 0},
  tabsScrollContent: {paddingHorizontal: scale(14), paddingTop: verticalScale(10)},
  tabsTrack: {
    flexDirection: 'row', backgroundColor: ASTRO.parchment, borderRadius: 30,
    borderWidth: 1, borderColor: ASTRO.line, padding: 3,
  },
  tabsTrackScroll: {alignSelf: 'flex-start'},
  tabsPill: {
    position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: 30,
    backgroundColor: ASTRO.maroon,
  },
  tabsItem: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: verticalScale(8)},
  tabsItemScroll: {flex: 0, paddingHorizontal: scale(14), borderRadius: 30},
  tabsItemScrollOn: {backgroundColor: ASTRO.maroon},
  tabsLabel: {fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: ASTRO.muted},
  tabsLabelOn: {color: COLORS.white},
});
