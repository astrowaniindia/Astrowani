// Birth-place lookup, replacing react-native-google-places-autocomplete.
//
// WHY THIS EXISTS: the Google Maps key shipped in the app was on a Cloud
// project with billing disabled, so BOTH Places Autocomplete and the Geocoding
// fallback returned REQUEST_DENIED. Nothing ever set coordinates, and because
// every report's Pay button is disabled until coordinates exist, the button sat
// greyed out with no explanation. Reported 2026-08-15 as "the pay button is not
// getting clicked" — the real cause was two silent 403s from Google.
//
// Open-Meteo's geocoding API needs no API key, no billing account and no
// signup, so there is no credential to expire and no card to keep on file. It
// is purpose-built for city lookup (which is exactly what a birth place is),
// and it returns country/admin names for disambiguation plus the IANA timezone.
//
// It also fails LOUDLY: a network error or an empty result set is surfaced in
// the UI instead of leaving the caller wondering why the form won't submit.
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const DEBOUNCE_MS = 350;
const MIN_QUERY = 2;

// "Nagpur, Maharashtra, India" — enough to tell duplicate city names apart,
// which matters for birth charts where the wrong city means the wrong chart.
export function formatPlace(r) {
  return [r.name, r.admin1, r.country].filter(Boolean).join(', ');
}

/**
 * One-shot lookup for a place NAME (not user keystrokes) — used to re-resolve
 * coordinates for a place a customer already typed once, e.g. their saved
 * profile's place of birth, which is stored as text only (no lat/lon). Returns
 * the same shape PlaceAutocomplete's own onSelect gives, or null if nothing
 * matched or the request failed — callers must treat null as "couldn't
 * auto-fill this field," never as "leave the old value," since a silent
 * failure here would submit a chart for the wrong coordinates.
 */
export async function geocodePlace(text) {
  const q = String(text || '').trim();
  if (!q) return null;
  try {
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const r = Array.isArray(json.results) ? json.results[0] : null;
    if (!r) return null;
    return {
      label: formatPlace(r),
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
      country: r.country,
      state: r.admin1 || '',
    };
  } catch (_) {
    return null;
  }
}

export default function PlaceAutocomplete({
  placeholder,
  onSelect,
  inputStyle,
  strings = {},
  // Seeds the box with an already-saved place (profile screens show a stored
  // value and only allow editing once unlocked). Treated as already-selected so
  // it does not immediately fire a search for text the user did not just type.
  initialValue = '',
  editable = true,
}) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(Boolean(initialValue));
  // Guards against a slow earlier response overwriting a newer one.
  const requestSeq = useRef(0);

  const search = useCallback(async (text) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError('');
    try {
      const url = `${GEOCODE_URL}?name=${encodeURIComponent(text)}&count=8&language=en&format=json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (seq !== requestSeq.current) return; // a newer query already ran
      const list = Array.isArray(json.results) ? json.results : [];
      setResults(list);
      // Distinguish "nothing matched that spelling" from "the lookup broke" —
      // conflating them is what made the original failure impossible to read.
      if (list.length === 0) {
        setError(strings.noMatches || 'No matching place found. Try a nearby city.');
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setResults([]);
      setError(strings.lookupFailed || 'Could not look up locations. Check your connection and try again.');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [strings.noMatches, strings.lookupFailed]);

  useEffect(() => {
    if (selected) return;                 // don't re-search the text we just filled in
    const text = query.trim();
    if (text.length < MIN_QUERY) {
      setResults([]);
      setError('');
      setLoading(false);
      return;
    }
    const id = setTimeout(() => search(text), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query, selected, search]);

  const choose = (r) => {
    const label = formatPlace(r);
    setQuery(label);
    setSelected(true);
    setResults([]);
    setError('');
    onSelect({
      label,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
      country: r.country,
      // The state/province — already folded into `label`, but callers that
      // need it as its own field (a profile's separate State field, e.g.)
      // shouldn't have to re-parse the formatted label to get it back out.
      state: r.admin1 || '',
    });
  };

  const onChangeText = (text) => {
    setQuery(text);
    if (selected) {
      // Editing after a pick invalidates the coordinates — tell the parent so
      // the submit button re-disables rather than silently keeping stale ones.
      setSelected(false);
      onSelect(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.inputRow, inputStyle]}>
        <TextInput
          style={[styles.input, !editable && styles.inputDisabled]}
          placeholder={placeholder}
          placeholderTextColor={COLORS.placeholder}
          value={query}
          onChangeText={onChangeText}
          autoCorrect={false}
          editable={editable}
        />
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
        ) : (
          <Ionicons
            name={selected ? 'checkmark-circle' : 'location-outline'}
            color={selected ? '#2E7D32' : COLORS.AstroMaroon}
            size={22}
          />
        )}
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {results.length > 0 && (
        <View style={styles.list}>
          {results.map((r) => (
            <TouchableOpacity key={String(r.id)} style={styles.item} onPress={() => choose(r)}>
              <Text style={styles.itemText} numberOfLines={1}>{formatPlace(r)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {marginBottom: verticalScale(10), position: 'relative', zIndex: 1000},
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(5),
    paddingHorizontal: scale(10),
    height: verticalScale(42),
  },
  input: {flex: 1, color: COLORS.black, fontSize: moderateScale(13), padding: 0},
  inputDisabled: {color: '#666'},
  error: {color: '#C0392B', fontSize: moderateScale(11), marginTop: verticalScale(4)},
  list: {
    position: 'absolute',
    top: verticalScale(45),
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderRadius: moderateScale(5),
    zIndex: 1000,
    elevation: 4,
    // iOS ignores `elevation`. Without these the suggestions dropdown renders
    // flat against the form behind it, which reads as part of the page rather
    // than as an overlay.
    shadowColor: '#4a2412',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#eee',
  },
  item: {paddingVertical: verticalScale(9), paddingHorizontal: scale(10), borderBottomWidth: 1, borderBottomColor: '#f2f2f2'},
  itemText: {color: COLORS.black, fontSize: moderateScale(12)},
});
