// import React, {useState, useEffect} from 'react';
// import {
//   View,
//   Text,
//   TouchableOpacity,
//   StyleSheet,
//   FlatList,
//   TextInput,
//   Platform,
//   ScrollView,
// } from 'react-native';
// import FontAwesome from 'react-native-vector-icons/FontAwesome';
// import {COLORS} from '../../../Theme/Colors';
// import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
// import DateTimePicker from '@react-native-community/datetimepicker';
// import DetailList from '../../component/DetailsList';

// const PanchangScreen = () => {
//   const [location, setLocation] = useState('New Delhi, NCT, India');
//   const [date, setDate] = useState(new Date());
//   const [showDatePicker, setShowDatePicker] = useState(false);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   // const [panchangData, setPanchangData] = useState(null);

//   useEffect(() => {
//     const fetchPanchangData = async () => {
//       try {
//         setLoading(true);

//         // Format date in ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)
//         const isoDate = date.toISOString();

//         // Static URL with query parameters
//         const url = 'https://astrology-3bjo.onrender.com/api/free-services/panchang?latitude=10.214747&longitude=78.097626&ayanamsa=1&language=en';

//         // POST request
//         const response = await fetch(url, {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json',
//           },
//           body: JSON.stringify({
//             datetime: isoDate,
//           }),
//         });

//         if (!response.ok) {
//           throw new Error(`HTTP error! status: ${response.status}`);
//         }

//         const data = await response.json();

//         // Handle successful response
//         console.log(data, "panchang data");
//         // setPanchangData(data);
//       } catch (err) {
//         // Handle error
//         console.log('error fetching data', err);
//         setError(err.message);
//       } finally {
//         setLoading(false);
//       }
//     };

//     fetchPanchangData();
//   }, [date]);


//   const handleLocationChange = newLocation => {
//     setLocation(newLocation);
//   };

//   const handleDateChange = () => {
//     // Implement date picker here
//   };

//   const panchangData = [
//     {label: 'Tithi', value: 'Dashami up to 01:22 AM, August 29'},
//     {label: 'Nakshatra', value: 'Mrigashirsha up to 03:54 PM'},
//     {label: 'Yoga', value: 'Vajra up to 07:09 PM'},
//     {label: 'First Karana', value: 'Vanija up to 01:26 PM'},
//     {label: 'Second Karana', value: 'Vishti up to 01:22 AM, August 29'},
//     {label: 'Vaar', value: 'Wednesday'},
//   ];

//   const additionalInfo = [
//     {label: 'Sun Rise', value: '06:01 AM'},
//     {label: 'Sun Sign', value: '06:42 PM'},
//     {label: 'Moon Rise', value: '12:12 AM'},
//   ];
//   const inauspiciousTime = [
//     {label: 'Sun Rise', value: '06:01 AM'},
//     {label: 'Sun Sign', value: '06:42 PM'},
//     {label: 'Moon Rise', value: '12:12 AM'},
//   ];
//   const auspiciousTime = [
//     {label: 'Sun Rise', value: '06:01 AM'},
//     {label: 'Sun Sign', value: '06:42 PM'},
//     {label: 'Moon Rise', value: '12:12 AM'},
//   ];

//   const handelDatePicker = () => {
//     setShowDatePicker(true);
//   };

//   const onDateChange = (event, selectedDate) => {
//     const currentDate = selectedDate || date;
//     setShowDatePicker(false);
//     setDate(currentDate);
//   };

//   return (
//     <View style={styles.container}>
//       <View style={styles.headerContainer}>
//         <TextInput
//           style={styles.locationInput}
//           value={location}
//           onChangeText={handleLocationChange}
//           placeholder="Enter your location"
//         />
//       </View>

//       <View style={styles.dateContainer}>
//         <TouchableOpacity onPress={handleDateChange}>
//           <Text style={styles.dateText}>
//             {date.toLocaleDateString('en-GB', {
//               weekday: 'long',
//               day: '2-digit',
//               month: 'long',
//               year: 'numeric',
//               hour: '2-digit',
//               minute: '2-digit',
//             })}
//           </Text>
//         </TouchableOpacity>
//         <TouchableOpacity>
//           <FontAwesome
//             name="calendar"
//             size={24}
//             color="white"
//             onPress={handelDatePicker}
//           />
//         </TouchableOpacity>
//       </View>

//       {showDatePicker && (
//         <DateTimePicker
//           value={date}
//           mode="date"
//           display="default"
//           onChange={onDateChange}
//         />
//       )}

//       {/* Remaining Screen Content */}
//       <ScrollView showsVerticalScrollIndicator={false}>
//         <DetailList title="Punchang" data={panchangData} />

//         <DetailList title="Additional Info" data={additionalInfo} />

//         <DetailList title="Inauspicious Time" data={inauspiciousTime} />
//         <DetailList title="Auspicious Time" data={auspiciousTime} />
//       </ScrollView>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: COLORS.AstroSoftOrange,
//   },
//   headerContainer: {
//     backgroundColor: COLORS.AstroMaroon,
//     padding: scale(15),
//   },

//   locationInput: {
//     marginTop: verticalScale(5),
//     backgroundColor: '#fff',
//     borderRadius: moderateScale(5),
//     fontFamily: 'Lato-Regular',

//     paddingHorizontal: scale(10),
//     paddingVertical: verticalScale(5),
//   },
//   dateContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     paddingHorizontal: scale(20),
//     backgroundColor: COLORS.AstroMaroon,
//     paddingVertical: verticalScale(10),
//   },
//   dateText: {
//     color: COLORS.AstroGold,
//     fontSize: moderateScale(16),
//     fontFamily: 'Lato-Bold',
//   },

//   flatlistContainer: {
//     padding: scale(10),
//     backgroundColor: COLORS.white,
//     borderBottomLeftRadius: moderateScale(8),
//     borderBottomRightRadius: moderateScale(8),
//   },
//   panchangContent: {
//     padding: scale(15),
//   },
//   row: {
//     flexDirection: 'row',
//     paddingVertical: verticalScale(8),
//     borderBottomWidth: verticalScale(1),
//     borderBottomColor: COLORS.AntiFlash,
//   },
//   label: {
//     fontFamily: 'Poppins-Bold',
//     color: '#000',
//     fontSize: moderateScale(12),
//     borderRightWidth: scale(1),
//     borderRightColor: COLORS.AntiFlash,
//     width: scale(100),
//   },
//   value: {
//     flex: 1,
//     fontWeight: 'bold',
//     color: '#000',
//     paddingLeft: scale(20),
//     fontSize: moderateScale(12),
//   },
//   sectionTitle: {
//     fontSize: moderateScale(15),
//     fontWeight: 'bold',
//     color: COLORS.AstroMaroon,
//     borderTopRightRadius: moderateScale(10),
//     borderTopLeftRadius: moderateScale(10),
//     textAlign: 'center',
//     paddingVertical: verticalScale(10),

//     backgroundColor: COLORS.lightTurquoise,
//   },
// });

// export default PanchangScreen;



import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../../utils/Scaling';
import DateTimePicker from '@react-native-community/datetimepicker';
import DetailList from '../../component/DetailsList';
import {
  ASTRO, SectionCard, StatTile, TileRow, Divider,
} from '../../../components/astro/AstroUI';
import PlaceAutocomplete from '../../../components/PlaceAutocomplete';
import { useNavigation } from '@react-navigation/native';
import { LanguageContext } from '../../../context/LanguageContext';
import { useFreeServiceLanguage } from '../../../components/astro/ReportLanguage';
import { FREE_SERVICES_URL } from '../../../config/api';


const PanchangScreen = () => {
  const { t } = React.useContext(LanguageContext);
  // Mounts the EN | हिं pill in the header and yields 'en'|'hi' for the request.
  // This screen has no `navigation` prop (it is rendered without one), hence useNavigation.
  const { apiLanguage } = useFreeServiceLanguage(useNavigation());
  const [location, setLocation] = useState('New Delhi, NCT, India');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [panchangData, setPanchangData] = useState(null);
  const [coordinates, setCoordinates] = useState({
    latitude: 10.214747,
    longitude: 78.097626
  });


  // Geocoder fallback removed with Google Places — PlaceAutocomplete resolves
  // coordinates on selection and surfaces its own failures inline.

  useEffect(() => {
    const fetchPanchangData = async () => {
      try {
        setLoading(true);
        const isoDate = date.toISOString();
        const url = `${FREE_SERVICES_URL}/api/free-services/panchang?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}&ayanamsa=1&language=${apiLanguage}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ datetime: isoDate }),
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setPanchangData(data.data);
      } catch (err) {
        console.log('error fetching data', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPanchangData();
    // apiLanguage included so switching language re-requests the panchang itself,
    // not just the labels around it.
  }, [date, coordinates.latitude, coordinates.longitude, apiLanguage]);

  const handleLocationChange = newLocation => setLocation(newLocation);

  const handleDateChange = () => setShowDatePicker(true);

  const onDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || date;
    setShowDatePicker(false);
    setDate(currentDate);
  };

  // (SunMoonHero and PeriodList are defined below the screen component.)

  const formatPanchangData = () => {
    if (!panchangData) return [];
    return [
      { label: t('panchang.vaara'), value: panchangData.vaara },
      { label: t('panchang.nakshatra'), value: panchangData.nakshatra?.[0]?.name },
      { label: t('panchang.tithi'), value: `${panchangData.tithi?.[0]?.name} (${panchangData.tithi?.[0]?.paksha})` },
      { label: t('panchang.karana'), value: panchangData.karana?.[0]?.name },
      { label: t('panchang.yoga'), value: panchangData.yoga?.[0]?.name },
    ];
  };

  const formatAdditionalInfo = () => {
    if (!panchangData) return [];
    return [
      { label: t('panchang.sunrise'), value: new Date(panchangData.sunrise).toLocaleTimeString() },
      { label: t('panchang.sunset'), value: new Date(panchangData.sunset).toLocaleTimeString() },
      { label: t('panchang.moonrise'), value: new Date(panchangData.moonrise).toLocaleTimeString() },
      { label: t('panchang.moonset'), value: new Date(panchangData.moonset).toLocaleTimeString() },
    ];
  };

  const formatAuspiciousTime = () => {
    if (!Array.isArray(panchangData?.auspicious_period)) return [];
    return panchangData.auspicious_period
      .filter(period => period?.period?.[0])
      .map(period => ({
        label: period.name,
        value: `${new Date(period.period[0].start).toLocaleTimeString()} - ${new Date(period.period[0].end).toLocaleTimeString()}`,
      }));
  };

  const formatInauspiciousTime = () => {
    if (!Array.isArray(panchangData?.inauspicious_period)) return [];
    return panchangData.inauspicious_period
      .filter(period => period?.period?.[0])
      .map(period => ({
        label: period.name,
        value: `${new Date(period.period[0].start).toLocaleTimeString()} - ${new Date(period.period[0].end).toLocaleTimeString()}`,
      }));
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
      {/* Unlike the birth-chart screens, Panchang keeps its default coordinates:
          it renders on open before any input, so it needs somewhere to start.
          Picking a location just refines it. The old code also destructured
          `details.geometry` unguarded, which threw whenever Places returned no
          details — including every time once billing lapsed. */}
      <PlaceAutocomplete
          placeholder={t('panchang.enterLocation')}
          inputStyle={styles.locationInput}
          onSelect={(picked) => {
            if (!picked) return;
            setLocation(picked.label);
            setCoordinates({
              latitude: picked.latitude,
              longitude: picked.longitude,
            });
          }}
        />
      </View>

      <View style={styles.dateContainer}>
        <TouchableOpacity onPress={handleDateChange}>
          <Text style={styles.dateText}>
            {date.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDateChange}>
          <FontAwesome name="calendar" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.loadingText}>{t('panchang.loading')}</Text>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <>
            {/* Sunrise/sunset led the "Additional Info" list as two of four
                identical text rows. They are the frame the whole day hangs on,
                so they lead the screen as a visual instead. */}
            <SunMoonHero panchang={panchangData} t={t} />
            <DetailList title={t('panchang.title')} data={formatPanchangData()} glyph="☀" />
            <DetailList title={t('panchang.additionalInfo')} data={formatAdditionalInfo()} glyph="◆" />
            <PeriodList
              title={t('panchang.auspiciousTime')}
              glyph="✓"
              tone="good"
              periods={panchangData?.auspicious_period}
            />
            <PeriodList
              title={t('panchang.inauspiciousTime')}
              glyph="✕"
              tone="bad"
              periods={panchangData?.inauspicious_period}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
};

const clockTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true});
};

/**
 * Sunrise → sunset as an actual arc of the day, with a marker for where "now" sits.
 *
 * These four timings were four text rows indistinguishable from Tithi and Karana.
 * Drawn, they answer "how much daylight is left" without any reading at all.
 */
function SunMoonHero({panchang, t}) {
  if (!panchang) return null;
  const rise = Date.parse(panchang.sunrise);
  const set = Date.parse(panchang.sunset);
  const valid = !isNaN(rise) && !isNaN(set) && set > rise;
  const now = Date.now();
  const progress = valid ? Math.max(0, Math.min(1, (now - rise) / (set - rise))) : 0;
  const dayHours = valid ? (set - rise) / 3600000 : 0;

  return (
    <SectionCard title={t('free.sunAndMoon')} glyph="☀" index={0}>
      <View style={styles.sunRow}>
        <View style={styles.sunEnd}>
          <Ionicons name="sunny" size={moderateScale(20)} color="#E8A33D" />
          <Text style={styles.sunLabel}>{t('panchang.sunrise')}</Text>
          <Text style={styles.sunTime}>{clockTime(panchang.sunrise)}</Text>
        </View>
        <View style={styles.sunTrackWrap}>
          <View style={styles.sunTrack}>
            <View style={[styles.sunFill, {width: `${progress * 100}%`}]} />
          </View>
          {valid && (
            <View style={[styles.sunDotWrap, {left: `${progress * 100}%`}]}>
              <View style={styles.sunDot} />
            </View>
          )}
          {dayHours > 0 && (
            <Text style={styles.sunSpan}>
              {t('free.dayLength')}: {Math.floor(dayHours)}h {Math.round((dayHours % 1) * 60)}m
            </Text>
          )}
        </View>
        <View style={styles.sunEnd}>
          <Ionicons name="moon" size={moderateScale(18)} color={ASTRO.maroon} />
          <Text style={styles.sunLabel}>{t('panchang.sunset')}</Text>
          <Text style={styles.sunTime}>{clockTime(panchang.sunset)}</Text>
        </View>
      </View>

      <Divider />
      <TileRow>
        <StatTile label={t('panchang.moonrise')} value={clockTime(panchang.moonrise)} />
        <StatTile label={t('panchang.moonset')} value={clockTime(panchang.moonset)} />
      </TileRow>
    </SectionCard>
  );
}

/**
 * Auspicious / inauspicious windows as colour-coded rows, with the one running
 * right now called out. They were label/value text rows in a generic list, which
 * gave no signal about which mattered or when.
 */
function PeriodList({title, glyph, tone, periods}) {
  const rows = Array.isArray(periods)
    ? periods.filter((p) => p?.period?.[0]).map((p) => ({
      name: p.name,
      start: p.period[0].start,
      end: p.period[0].end,
    }))
    : [];
  if (!rows.length) return null;
  const accent = tone === 'good' ? ASTRO.good : ASTRO.bad;
  const now = Date.now();

  return (
    <SectionCard title={title} glyph={glyph} index={tone === 'good' ? 3 : 4}>
      {rows.map((r, i) => {
        const s = Date.parse(r.start);
        const e = Date.parse(r.end);
        const active = !isNaN(s) && !isNaN(e) && now >= s && now <= e;
        return (
          <View key={i} style={[styles.periodRow, active && {borderColor: accent, borderWidth: 1.5}]}>
            <View style={[styles.periodAccent, {backgroundColor: accent}]} />
            <View style={styles.periodBody}>
              <Text style={styles.periodName}>{r.name}</Text>
              <Text style={styles.periodTime}>{clockTime(r.start)} – {clockTime(r.end)}</Text>
            </View>
            {active && (
              <View style={[styles.periodNow, {backgroundColor: accent}]}>
                <Text style={styles.periodNowText}>●</Text>
              </View>
            )}
          </View>
        );
      })}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ASTRO.parchmentDeep,
  },
  sunRow: {flexDirection: 'row', alignItems: 'center'},
  sunEnd: {alignItems: 'center', width: scale(64)},
  sunLabel: {
    fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2,
  },
  sunTime: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.ink},
  sunTrackWrap: {flex: 1, paddingHorizontal: scale(6)},
  sunTrack: {
    height: verticalScale(6), borderRadius: 20, backgroundColor: ASTRO.parchmentDeep,
    overflow: 'hidden',
  },
  sunFill: {height: '100%', borderRadius: 20, backgroundColor: '#E8A33D'},
  sunDotWrap: {position: 'absolute', top: 0, marginLeft: -scale(5)},
  sunDot: {
    width: scale(10), height: scale(10), borderRadius: scale(5),
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#E8A33D',
  },
  sunSpan: {
    fontSize: moderateScale(9.5), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    textAlign: 'center', marginTop: verticalScale(6),
  },

  periodRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: ASTRO.line, borderRadius: moderateScale(9),
    marginBottom: verticalScale(7), overflow: 'hidden',
  },
  periodAccent: {width: scale(4), alignSelf: 'stretch'},
  periodBody: {flex: 1, padding: scale(9)},
  periodName: {fontSize: moderateScale(12.5), fontFamily: 'Lato-Bold', color: ASTRO.ink},
  periodTime: {fontSize: moderateScale(11), fontFamily: 'Lato-Bold', color: ASTRO.maroon, marginTop: 1},
  periodNow: {
    width: moderateScale(18), height: moderateScale(18), borderRadius: moderateScale(9),
    alignItems: 'center', justifyContent: 'center', marginRight: scale(9),
  },
  periodNowText: {color: '#fff', fontSize: moderateScale(8)},

  legacyContainer: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
  },
  headerContainer: {
    backgroundColor: COLORS.AstroMaroon,
    padding: scale(15),
  },
  locationInput: {
    marginTop: verticalScale(5),
    backgroundColor: '#fff',
    borderRadius: moderateScale(5),
    fontFamily: 'Lato-Regular',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(5),
    color: '#000',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(10),
  },
  dateText: {
    color: COLORS.AstroGold,
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: verticalScale(20),
    fontSize: moderateScale(16),
    color: COLORS.AstroMaroon,
  },
  errorText: {
    textAlign: 'center',
    marginTop: verticalScale(20),
    fontSize: moderateScale(16),
    color: 'red',
  },
});

export default PanchangScreen;
