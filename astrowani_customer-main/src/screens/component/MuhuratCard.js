// import React, { useState, useEffect } from 'react';
// import {
//   View,
//   Text,
//   TouchableOpacity,
//   StyleSheet,
//   FlatList,
//   KeyboardAvoidingView,
//   Platform,
//   SafeAreaView,
// } from 'react-native';
// import FontAwesome from 'react-native-vector-icons/FontAwesome';
// import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
// import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
// import DateTimePicker from '@react-native-community/datetimepicker';
// import { COLORS } from '../../Theme/Colors';
// import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
// import Geolocation from '@react-native-community/geolocation';

// const MuhuratCard = ({ title, data }) => {
//   const [location, setLocation] = useState('');
//   const [latitude, setLatitude] = useState('');
//   const [longitude, setLongitude] = useState('');
//   const [date, setDate] = useState(new Date());
//   const [showDatePicker, setShowDatePicker] = useState(false);
//   const [currentEndpoint, setCurrentEndpoint] = useState('');

//   useEffect(() => {
//     // Get current location when component mounts
//     Geolocation.getCurrentPosition(
//       position => {
//         setLatitude(position.coords.latitude.toString());
//         setLongitude(position.coords.longitude.toString());
        
//         // Reverse geocode to get address
//         fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${position.coords.latitude},${position.coords.longitude}&key=AIzaSyD9gQiOP8vVtzDFjLjF59SL2MlcHXhjAsA`)
//           .then(response => response.json())
//           .then(data => {
//             if (data.results[0]) {
//               setLocation(data.results[0].formatted_address);
//             }
//           })
//           .catch(error => console.error('Error:', error));
//       },
//       error => console.error(error),
//       { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
//     );
//   }, []);

//   const getApiEndpoint = () => {
//     let endpoint = '';
//     switch (title) {
//       case 'Day Choghadiya':
//         endpoint = '/choghadiya';
//         break;
//       case 'Day Hora':
//         endpoint = '/hora-timing';
//         break;
//       case 'Gowri Panchangam':
//         endpoint = '/gowri-nalla-neram';
//         break;
//       case 'Rahu Kaal':
//         endpoint = '/rahu-kaal';
//         break;
//       default:
//         endpoint = '';
//     }
    
//     if (endpoint !== currentEndpoint) {
//       setCurrentEndpoint(endpoint);
//     }
    
//     return endpoint;
//   };

//   useEffect(() => {
//     const endpoint = getApiEndpoint();
//     if (endpoint !== currentEndpoint) {
//       setCurrentEndpoint(endpoint);
//     }
//   }, [title]);

//   useEffect(() => {
//     if (latitude && longitude && date && currentEndpoint) {
//       fetchMuhuratData();
//     }
//   }, [latitude, longitude, date, currentEndpoint]);

//   const handleDateChange = () => {
//     setShowDatePicker(true);
//   };

//   const onDateChange = (event, selectedDate) => {
//     const currentDate = selectedDate || date;
//     setShowDatePicker(Platform.OS === 'ios');
//     setDate(currentDate);
//   };

//   const fetchMuhuratData = async () => {
//     try {
//       const requestBody = {
//         date: date.toISOString().split('T')[0],
//         location: {
//           latitude: latitude,
//           longitude: longitude,
//         }
//       };

//       console.log('Fetching data for:', currentEndpoint, requestBody);

//       const response = await fetch(
//         `https://astrology-3bjo.onrender.com/api/free-services/shubh-muhurat${currentEndpoint}`,
//         {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json',
//           },
//           body: JSON.stringify(requestBody),
//         }
//       );

//       const result = await response.json();
//       console.log('API Response:', result);
//       // Handle the API response here
//     } catch (error) {
//       console.error('Error fetching muhurat data:', error);
//     }
//   };

//   const renderItem = ({ item }) => (
//     <View style={styles.row}>
//       <View>
//         <View style={styles.rowHeader}>
//           {item.name && (
//             <View style={styles.rowHeader}>
//               <Text style={styles.choghadiyaName}>{item.name}</Text>
//               {item.icon && (
//                 <View style={styles.iconContainer}>
//                   <Text style={styles.subText}>{item.subText}</Text>
//                   <Icon name={item.icon} size={20} color="#E91E63" />
//                 </View>
//               )}
//             </View>
//           )}
//         </View>
//         {item.time && <Text style={styles.time}>{item.time}</Text>}
//       </View>
//       <Text style={styles.description}>{item.description}</Text>
//     </View>
//   );

//   return (
//     <SafeAreaView style={styles.container}>
//       <KeyboardAvoidingView 
//         behavior={Platform.OS === "ios" ? "padding" : "height"}
//         style={styles.keyboardAvoidingView}
//       >
//         <View style={styles.headerContainer}>
//           <GooglePlacesAutocomplete
//             placeholder={t('panchang.enterLocation')}
//             onPress={(data, details = null) => {
//               setLocation(data.description);
//               setLatitude(details?.geometry?.location?.lat?.toString() || '');
//               setLongitude(details?.geometry?.location?.lng?.toString() || '');
//             }}
//             query={{
//               key: 'AIzaSyD9gQiOP8vVtzDFjLjF59SL2MlcHXhjAsA',
//               language: 'en',
//             }}
//             textInputProps={{
//               value: location,
//               onChangeText: setLocation,
//             }}
//             styles={{
//               container: styles.autocompleteContainer,
//               textInputContainer: styles.locationInput,
//               textInput: styles.locationInputText,
//               listView: styles.autocompleteList,
//             }}
//           />
//           <View style={styles.dateContainer}>
//             <TouchableOpacity onPress={handleDateChange}>
//               <Text style={styles.dateText}>
//                 {date.toLocaleDateString('en-GB', {
//                   weekday: 'long',
//                   day: '2-digit',
//                   month: 'long',
//                   year: 'numeric',
//                 })}
//               </Text>
//             </TouchableOpacity>
//             <TouchableOpacity onPress={handleDateChange}>
//               <FontAwesome name="calendar" size={24} color="white" />
//             </TouchableOpacity>
//           </View>
//         </View>

//         {showDatePicker && (
//           <DateTimePicker
//             value={date}
//             mode="date"
//             display="default"
//             onChange={onDateChange}
//           />
//         )}

//         <Text style={styles.header}>{title}</Text>
//         <FlatList
//           data={data}
//           renderItem={renderItem}
//           keyExtractor={(item, index) => index.toString()}
//           contentContainerStyle={styles.flatListContent}
//         />
//       </KeyboardAvoidingView>
//     </SafeAreaView>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: COLORS.AstroSoftOrange,
//   },
//   keyboardAvoidingView: {
//     flex: 1,
//   },
//   headerContainer: {
//     backgroundColor: COLORS.AstroMaroon,
//     borderRadius: moderateScale(10),
//     margin: scale(15),
//     padding: scale(15),
//   },
//   autocompleteContainer: {
//     flex: 0,
//     marginBottom: verticalScale(10),
//   },
//   locationInput: {
//     backgroundColor: '#fff',
//     borderRadius: moderateScale(5),
//   },
//   locationInputText: {
//     fontSize: moderateScale(13),
//     fontFamily: 'Lato-Regular',
//     color: '#000',
//   },
//   autocompleteList: {
//     backgroundColor: '#fff',
//     borderRadius: moderateScale(5),
//     marginTop: verticalScale(3),
//   },
//   dateContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     paddingVertical: verticalScale(10),
//   },
//   dateText: {
//     color: COLORS.AstroGold,
//     fontSize: moderateScale(15),
//     fontFamily: 'Lato-Bold',
//   },
//   header: {
//     fontSize: moderateScale(17),
//     fontFamily: 'Lato-Bold',
//     color: '#000',
//     marginVertical: verticalScale(15),
//     marginHorizontal: scale(15),
//     backgroundColor: COLORS.lightTurquoise,
//     padding: scale(7),
//     borderRadius: moderateScale(8),
//   },
//   flatListContent: {
//     paddingHorizontal: scale(15),
//   },
//   row: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     marginBottom: verticalScale(10),
//     paddingBottom: verticalScale(10),
//     borderBottomWidth: 1,
//     borderBottomColor: '#ccc',
//   },
//   rowHeader: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   choghadiyaName: {
//     fontSize: moderateScale(16),
//     fontFamily: 'Lato-Bold',
//     color: '#000',
//   },
//   iconContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginLeft: scale(10),
//   },
//   subText: {
//     fontSize: moderateScale(13),
//     fontFamily: 'Lato-Regular',
//     color: '#E91E63',
//     marginRight: scale(5),
//   },
//   time: {
//     fontSize: moderateScale(13),
//     fontFamily: 'Lato-Regular',
//     color: 'red',
//     marginVertical: verticalScale(5),
//   },
//   description: {
//     fontSize: moderateScale(13),
//     fontFamily: 'Lato-Regular',
//     color: '#000',
//     width: scale(160),
//   },
// });

// export default MuhuratCard;


import React, { useContext, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import PlaceAutocomplete from '../../components/PlaceAutocomplete';
import { reverseGeocode } from '../../utils/geocoding';
import Geolocation from '@react-native-community/geolocation';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { FREE_SERVICES_URL } from '../../config/api';
import { LanguageContext } from '../../context/LanguageContext';
import { ASTRO, Reveal, ConsultCta } from '../../components/astro/AstroUI';
import { apiLang } from '../../components/astro/ReportLanguage';

// Choghadiya / Hora / Rahu Kaal all report a "type" per window. These are the
// classical classifications; anything unrecognised stays neutral rather than
// being guessed at, since calling an inauspicious window auspicious is worse
// than saying nothing.
const GOOD_TYPES = [
  'shubh', 'amrit', 'labh', 'char', 'amruta', 'good', 'auspicious', 'shubha',
  'शुभ', 'अमृत', 'लाभ', 'चर',
];
const BAD_TYPES = [
  'rog', 'kaal', 'udveg', 'kala', 'bad', 'inauspicious', 'rahu', 'yamaganda', 'gulika',
  'अशुभ', 'रोग', 'काल', 'उद्वेग', 'राहु', 'यमगण्ड', 'गुलिक',
];

function muhuratTone(item) {
  const hay = `${item?.description || ''} ${item?.name || ''}`.toLowerCase();
  // BAD is tested FIRST and this order is load-bearing: "अशुभ" (inauspicious) contains
  // "शुभ" (auspicious) as a substring, so testing good-first would classify every
  // inauspicious Hindi window as auspicious — the exact opposite of the truth, on a
  // screen people use to decide when to do things.
  if (BAD_TYPES.some(w => hay.includes(w))) return 'bad';
  if (GOOD_TYPES.some(w => hay.includes(w))) return 'good';
  return 'neutral';
}

function isNow(item) {
  const s = Date.parse(item?.start);
  const e = Date.parse(item?.end);
  if (isNaN(s) || isNaN(e)) return false;
  const now = Date.now();
  return now >= s && now <= e;
}

const muStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: ASTRO.parchment, borderRadius: moderateScale(10),
    borderWidth: 1, borderColor: ASTRO.line, marginBottom: verticalScale(9), overflow: 'hidden',
  },
  cardNow: { borderColor: ASTRO.gold, borderWidth: 1.5, backgroundColor: '#FFFDF3' },
  accent: { width: scale(5) },
  body: { flex: 1, padding: scale(11) },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: ASTRO.ink },
  nowPill: {
    backgroundColor: ASTRO.good, borderRadius: 20,
    paddingHorizontal: scale(9), paddingVertical: verticalScale(2),
  },
  nowPillText: { fontSize: moderateScale(9.5), fontFamily: 'Lato-Bold', color: '#fff' },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(4) },
  time: {
    fontSize: moderateScale(12.5), fontFamily: 'Lato-Bold', color: ASTRO.maroon,
    marginLeft: scale(5),
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: verticalScale(6) },
  tag: {
    borderWidth: 1, borderRadius: 20, paddingHorizontal: scale(8),
    paddingVertical: verticalScale(2), marginRight: scale(7),
  },
  tagText: { fontSize: moderateScale(10), fontFamily: 'Lato-Bold' },
  toneText: {
    fontSize: moderateScale(10), fontFamily: 'Lato-Bold',
    textTransform: 'uppercase', letterSpacing: 0.4, marginRight: scale(7),
  },
  subText: { fontSize: moderateScale(10.5), fontFamily: 'Lato-Regular', color: ASTRO.muted },
});

const MuhuratCard = ({ title }) => {
  const { t, language } = useContext(LanguageContext);
  // The backend has always accepted ?language= on these endpoints and forwards it to
  // JyotishamAstroAPI as `lang`; the app just never sent it, which is why the muhurat
  // names and types stayed English while the rest of the screen turned Hindi.
  const apiLanguage = apiLang(language);
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentEndpoint, setCurrentEndpoint] = useState('');
  const [processedData, setProcessedData] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Geolocation.getCurrentPosition(
      position => {
        setLatitude(position.coords.latitude.toString());
        setLongitude(position.coords.longitude.toString());
        
        // Reverse geocode via BigDataCloud (no key, no billing) instead of the
        // Google Geocoding API, whose Cloud project has billing disabled — that
        // call returned REQUEST_DENIED, so the location label stayed blank while
        // the timings below silently rendered for the raw coordinates.
        reverseGeocode(position.coords.latitude, position.coords.longitude)
          .then(place => setLocation(place.label))
          .catch(err => {
            // Not fatal: the muhurat timings only need lat/lng, which we already
            // have. Only the display label is missing, so log and carry on.
            console.log('Reverse geocode failed:', err.message);
          });
      },
      error => console.error('Geolocation Error:', error),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
    );
  }, []);

  const getApiEndpoint = () => {
    switch (title) {
      case 'Day Choghadiya':
        return '/choghadiya';
      case 'Day Hora':
        return '/hora-timing';
      case 'Rahu Kaal':
        return '/rahu-kaal';
      default:
        return '';
    }
  };

  useEffect(() => {
    const endpoint = getApiEndpoint();
    setCurrentEndpoint(endpoint);
  }, [title]);

  useEffect(() => {
    if (latitude && longitude && date && currentEndpoint) {
      fetchMuhuratData();
    }
    // `apiLanguage` is a dependency: flipping the header toggle must re-request the
    // timings in the other language, not just relabel the chrome around them.
  }, [latitude, longitude, date, currentEndpoint, apiLanguage]);

  // A title with no endpoint can never resolve, so the fetch-gating effect above never
  // fires and `isLoading` — which starts true — would never flip back, leaving the tab
  // spinning forever. Fail visibly instead of hanging. (This previously special-cased
  // 'Gowri Panchangam' into hardcoded sample data; see formatMuhuratData for why that
  // tab is gone.)
  useEffect(() => {
    if (!getApiEndpoint()) {
      setProcessedData([]);
      setError(null);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  const handlePlaceSelect = (picked) => {
    // Null means the user edited the text after picking, so the old coordinates
    // no longer describe what is on screen. Keep them rather than clearing:
    // this card always shows timings for *somewhere*, and the geolocation
    // fallback already seeded a valid position on mount.
    if (!picked) return;
    setLocation(picked.label);
    setLatitude(String(picked.latitude));
    setLongitude(String(picked.longitude));
  };

  const handleDateChange = () => {
    setShowDatePicker(true);
  };

  const onDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || date;
    setShowDatePicker(Platform.OS === 'ios');
    setDate(currentDate);
  };

  const formatTime = (isoString) => {
    try {
      return new Date(isoString).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting time:', error);
      return isoString; // Return original string if parsing fails
    }
  };

  const formatMuhuratData = (apiResponse) => {
    console.log("Formatting data for:", title);
    console.log("API response in formatMuhuratData: typeof", typeof apiResponse);
    
    switch (title) {
      case 'Day Choghadiya':
        return apiResponse?.choghadiya?.data?.muhurat?.map(item => ({
          name: item.name,
          time: `${formatTime(item.start)} - ${formatTime(item.end)}`,
          // Raw bounds kept alongside the display string so a row can tell whether it is
          // the window happening right now — the most useful thing on a muhurat screen,
          // and not derivable at render time once the times were pre-formatted.
          start: item.start,
          end: item.end,
          description: item.type,
          icon: "",
          subText: item.vela || ''
        })) || [];

      case 'Day Hora':
        return apiResponse?.horaTiming?.data?.hora_timing?.map(item => ({
          name: `${item.hora.name} (${item.hora.vedic_name})`,
          time: `${formatTime(item.start)} - ${formatTime(item.end)}`,
          start: item.start,
          end: item.end,
          description: item.type,
          icon: "",
        })) || [];

      case 'Rahu Kaal':
        return apiResponse?.rahuKaal?.data.muhurat?.map(item => ({
          name: item.name,
          time: item.period.map(period => 
            `${formatTime(period.start)} - ${formatTime(period.end)}`
          ).join(', '),
          description: item.type,
          icon:""
        })) || [];

      // NOTE: there used to be a 'Gowri Panchangam' case here returning four
      // HARDCODED windows ("06:02 - 07:37 Mars", "07:37 - 09:11 Sun", then those
      // same two again). They were not computed from anything — not from the
      // date, not from the location — so every user saw identical timings for
      // every day and every place. Neither our backend nor JyotishamAstroAPI has
      // a Gowri/Nalla-Neram endpoint (probed 2026-08-16: all candidate paths
      // 404), so the tab has been removed from ShubhMuhurat rather than shipping
      // invented muhurat timings people might plan around. Restore the tab when a
      // real endpoint exists.
      default:
        console.error("Unknown title:", title);
        return [];
    }
  };

  const fetchMuhuratData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const requestBody = {
        date: date.toISOString().split('T')[0],
        location: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        }
      };

      const response = await fetch(
        `${FREE_SERVICES_URL}/api/free-services/shubh-muhurat${currentEndpoint}?language=${apiLanguage}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("API response:", JSON.stringify(result, null, 2));

      const formattedData = formatMuhuratData(result);
      console.log("Formatted data:", JSON.stringify(formattedData, null, 2));

      setProcessedData(formattedData);
    } catch (error) {
      console.error('Error fetching muhurat data:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderItem = ({ item, index }) => {
    const tone = muhuratTone(item);
    const active = isNow(item);
    // Some feeds carry only a `description` and no `name`, in which case the
    // description IS the title — showing it again as a tag rendered "Mars" twice
    // in the same card. Resolve the title first, then only tag what it isn't.
    const title_ = item.name || item.description;
    const showTag = !!item.description && item.description !== title_;
    const accent = tone === 'good' ? ASTRO.good : tone === 'bad' ? ASTRO.bad : ASTRO.gold;
    const toneLabel = tone === 'good' ? t('free.auspicious')
      : tone === 'bad' ? t('free.inauspicious') : t('free.neutral');
    return (
      <Reveal index={index}>
        <View style={[muStyles.card, active && muStyles.cardNow]}>
          {/* Colour bar on the leading edge: the whole point of a muhurat list is which
              windows are auspicious, and that was previously a plain-text "type" word
              stranded at the right-hand edge of the row. */}
          <View style={[muStyles.accent, { backgroundColor: accent }]} />
          <View style={muStyles.body}>
            <View style={muStyles.topRow}>
              <Text style={muStyles.name}>{title_}</Text>
              {active && (
                <View style={muStyles.nowPill}>
                  <Text style={muStyles.nowPillText}>{t('free.now')}</Text>
                </View>
              )}
            </View>
            {!!item.time && (
              <View style={muStyles.timeRow}>
                <Icon name="clock-outline" size={moderateScale(13)} color={ASTRO.muted} />
                <Text style={muStyles.time}>{item.time}</Text>
              </View>
            )}
            <View style={muStyles.tagRow}>
              {showTag && (
                <View style={[muStyles.tag, { borderColor: accent }]}>
                  <Text style={[muStyles.tagText, { color: accent }]}>{item.description}</Text>
                </View>
              )}
              <Text style={[muStyles.toneText, { color: accent }]}>{toneLabel}</Text>
              {!!item.subText && <Text style={muStyles.subText}>{item.subText}</Text>}
            </View>
          </View>
        </View>
      </Reveal>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.headerContainer}>
          <PlaceAutocomplete
            placeholder="Enter your location"
            inputStyle={styles.locationInput}
            onSelect={handlePlaceSelect}
          />
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
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={onDateChange}
          />
        )}

        <Text style={styles.header}>{title}</Text>
        
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
            <Text style={styles.loadingText}>{t('panchang.loading')}</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <FlatList
            data={processedData}
            renderItem={renderItem}
            keyExtractor={(item, index) => index.toString()}
            contentContainerStyle={styles.flatListContent}
            ListEmptyComponent={<Text style={styles.emptyText}>{t('common.noDataAvailable')}</Text>}
            // Footer rather than a sibling below the list: as a sibling it would
            // occupy a fixed band above the tab bar on every tab, permanently
            // shortening the timing list it is meant to follow.
            ListFooterComponent={<ConsultCta source="muhurat" style={styles.consultSpacer} />}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default MuhuratCard;
const styles = StyleSheet.create({
  consultSpacer: {marginTop: verticalScale(10), marginBottom: verticalScale(20)},
  container: {
    flex: 1,
    backgroundColor: ASTRO.parchmentDeep,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: moderateScale(14),
    color: COLORS.AstroMaroon,
  },
  headerContainer: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(10),
    margin: scale(15),
    padding: scale(15),
  },
  autocompleteContainer: {
    flex: 0,
    marginBottom: verticalScale(10),
  },
  locationInput: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(5),
  },
  locationInputText: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: '#000',
  },
  autocompleteList: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(5),
    marginTop: verticalScale(3),
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(10),
  },
  dateText: {
    color: COLORS.AstroGold,
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Bold',
  },
  header: {
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Bold',
    color: ASTRO.maroon,
    marginTop: verticalScale(14),
    marginBottom: verticalScale(8),
    marginHorizontal: scale(15),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  flatListContent: {
    paddingHorizontal: scale(15),
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: verticalScale(10),
    paddingBottom: verticalScale(10),
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  choghadiyaName: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: '#000',
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: scale(10),
  },
  subText: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: '#E91E63',
    marginRight: scale(5),
  },
  time: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: 'red',
    marginVertical: verticalScale(5),
  },
  description: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: '#000',
    width: scale(160),
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    margin: 10,
  },
  emptyText: {
    textAlign: 'center',
    margin: 10,
  },
});

