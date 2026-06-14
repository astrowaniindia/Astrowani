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
//             placeholder="Enter your location"
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


import React, { useState, useEffect } from 'react';
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
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import Geolocation from '@react-native-community/geolocation';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

const MuhuratCard = ({ title }) => {
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
        
        fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${position.coords.latitude},${position.coords.longitude}&key=AIzaSyD9gQiOP8vVtzDFjLjF59SL2MlcHXhjAsA`)
          .then(response => response.json())
          .then(data => {
            if (data.results[0]) {
              setLocation(data.results[0].formatted_address);
            }
          })
          .catch(error => console.error('Geocoding Error:', error));
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
      console.log("Fetching data for:", currentEndpoint);
    }
  }, [latitude, longitude, date, currentEndpoint]);

  const handlePlaceSelect = (data, details = null) => {
    if (details?.geometry?.location) {
      setLocation(data.description);
      setLatitude(details.geometry.location.lat.toString());
      setLongitude(details.geometry.location.lng.toString());
    }
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
          description: item.type,
              icon:"",
          subText: item.vela || ''
        })) || [];

      case 'Day Hora':
        return apiResponse?.horaTiming?.data?.hora_timing?.map(item => ({
          name: `${item.hora.name} (${item.hora.vedic_name})`,
          time: `${formatTime(item.start)} - ${formatTime(item.end)}`,
          description: item.type,
          icon:"",
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

      case 'Gowri Panchangam':
        return [
          {
            time: '06:02 - 07:37',
            description: 'Mars',
          },
          {
            time: '07:37 - 09:11',
            description: 'Sun',
          },
          {
            time: '06:02 - 07:37',
            description: 'Mars',
          },
          {
            time: '07:37 - 09:11',
            description: 'Sun',
          }
        ];

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

      console.log("Fetching data for:", currentEndpoint);
      console.log("Request body:", JSON.stringify(requestBody, null, 2));

      const response = await fetch(
        `https://astrowani-fb6pi.ondigitalocean.app/api/free-services/shubh-muhurat${currentEndpoint}`,
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

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <View>
        <View style={styles.rowHeader}>
          {item.name && (
            <View style={styles.rowHeader}>
              <Text style={styles.choghadiyaName}>{item.name}</Text>
              {item.icon && (
                <View style={styles.iconContainer}>
                  {item.subText && <Text style={styles.subText}>{item.subText}</Text>}
                  <Icon name={item.icon} size={20} color="#E91E63" />
                </View>
              )}
            </View>
          )}
        </View>
        {item.time && <Text style={styles.time}>{item.time}</Text>}
      </View>
      <Text style={styles.description}>{item.description}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.headerContainer}>
          <GooglePlacesAutocomplete
            placeholder="Enter your location"
            onPress={handlePlaceSelect}
            query={{
              key: 'AIzaSyD9gQiOP8vVtzDFjLjF59SL2MlcHXhjAsA',
              language: 'en',
            }}
            textInputProps={{
              value: location,
              onChangeText: setLocation,
            }}
            styles={{
              container: styles.autocompleteContainer,
              textInputContainer: styles.locationInput,
              textInput: styles.locationInputText,
              listView: styles.autocompleteList,
            }}
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
            <Text style={styles.loadingText}>Loading data...</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>Error: {error}</Text>
        ) : (
          <FlatList
            data={processedData}
            renderItem={renderItem}
            keyExtractor={(item, index) => index.toString()}
            contentContainerStyle={styles.flatListContent}
            ListEmptyComponent={<Text style={styles.emptyText}>No data available</Text>}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default MuhuratCard;
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
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
    fontSize: moderateScale(17),
    fontFamily: 'Lato-Bold',
    color: '#000',
    marginVertical: verticalScale(15),
    marginHorizontal: scale(15),
    backgroundColor: COLORS.lightTurquoise,
    padding: scale(7),
    borderRadius: moderateScale(8),
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

