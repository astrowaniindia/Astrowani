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
} from 'react-native';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { COLORS } from '../../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../../utils/Scaling';
import DateTimePicker from '@react-native-community/datetimepicker';
import DetailList from '../../component/DetailsList';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import Geocoder from 'react-native-geocoding';

Geocoder.init("AIzaSyD9gQiOP8vVtzDFjLjF59SL2MlcHXhjAsA"); // 

const PanchangScreen = () => {
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


  const getCoordinates = (place, setLatitude, setLongitude) => {
    Geocoder.from(place)
      .then(json => {
        const location = json.results[0].geometry.location;
        setLatitude(location.lat);
        setLongitude(location.lng);
      })
      .catch(error => console.warn(error));
  };

  useEffect(() => {
    const fetchPanchangData = async () => {
      try {
        setLoading(true);
        const isoDate = date.toISOString();
        const url = `https://astrowani-fb6pi.ondigitalocean.app/api/free-services/panchang?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}&ayanamsa=1&language=en`;
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
  }, [date, coordinates.latitude, coordinates.longitude]);

  const handleLocationChange = newLocation => setLocation(newLocation);

  const handleDateChange = () => setShowDatePicker(true);

  const onDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || date;
    setShowDatePicker(false);
    setDate(currentDate);
  };

  const formatPanchangData = () => {
    if (!panchangData) return [];
    return [
      { label: 'Vaara', value: panchangData.vaara },
      { label: 'Nakshatra', value: panchangData.nakshatra[0].name },
      { label: 'Tithi', value: `${panchangData.tithi[0].name} (${panchangData.tithi[0].paksha})` },
      { label: 'Karana', value: panchangData.karana[0].name },
      { label: 'Yoga', value: panchangData.yoga[0].name },
    ];
  };

  const formatAdditionalInfo = () => {
    if (!panchangData) return [];
    return [
      { label: 'Sun Rise', value: new Date(panchangData.sunrise).toLocaleTimeString() },
      { label: 'Sun Set', value: new Date(panchangData.sunset).toLocaleTimeString() },
      { label: 'Moon Rise', value: new Date(panchangData.moonrise).toLocaleTimeString() },
      { label: 'Moon Set', value: new Date(panchangData.moonset).toLocaleTimeString() },
    ];
  };

  const formatAuspiciousTime = () => {
    if (!panchangData) return [];
    return panchangData.auspicious_period.map(period => ({
      label: period.name,
      value: `${new Date(period.period[0].start).toLocaleTimeString()} - ${new Date(period.period[0].end).toLocaleTimeString()}`,
    }));
  };

  const formatInauspiciousTime = () => {
    if (!panchangData) return [];
    return panchangData.inauspicious_period.map(period => ({
      label: period.name,
      value: `${new Date(period.period[0].start).toLocaleTimeString()} - ${new Date(period.period[0].end).toLocaleTimeString()}`,
    }));
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
      <GooglePlacesAutocomplete
          placeholder="Enter your location"
          onPress={(data, details = null) => {
            setLocation(data.description);
            const { lat, lng } = details.geometry.location;
            setCoordinates({
              latitude: lat,
              longitude: lng
            });
          }}
          query={{
            key: 'AIzaSyD9gQiOP8vVtzDFjLjF59SL2MlcHXhjAsA',
            language: 'en',
          }}
          styles={{
            container: {
              flex: 0,
            },
            textInput: {
              ...styles.locationInput,
            },
            listView: {
              backgroundColor: 'white',
              borderRadius: moderateScale(5),
              position: 'absolute',
              top: Platform.select({ ios: verticalScale(45), android: verticalScale(45) }),
              left: 0,
              right: 0,
              zIndex: 10000,
              elevation: 3,
            },
          }}
          enablePoweredByContainer={false}
          fetchDetails={true}
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
          <Text style={styles.loadingText}>Loading...</Text>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <>
            <DetailList title="Panchang" data={formatPanchangData()} />
            <DetailList title="Additional Info" data={formatAdditionalInfo()} />
            <DetailList title="Auspicious Time" data={formatAuspiciousTime()} />
            <DetailList title="Inauspicious Time" data={formatInauspiciousTime()} />
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
