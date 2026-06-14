import React, { useEffect, useState } from 'react';
import { View, Text, Image, ImageBackground, TouchableOpacity, FlatList, StyleSheet, } from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import Instance from '../../api/ApiCall';

const Live = ({ navigation }) => {
  const sessions = [
    {
      id: '1',
      name: 'PARAM',
      title: 'Daily Predictions',
      time: 'Today, 11:30 AM',
      image:
        'https://astrowaniindia.com/wp-content/uploads/2024/07/Pandit-ji-new-140x140.png',
      backgroundImage:
        'https://th.bing.com/th?q=Astrology+Wallpaper+4K&w=120&h=120&c=1&rs=1&qlt=90&cb=1&pid=InlineBlock&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247',
    },
    {
      id: '2',
      name: 'Taro Renu',
      title: 'Tarot Reading',
      time: 'Today, 11:08 AM',
      image:
        'https://astrowaniindia.com/wp-content/uploads/2024/07/Pandit-ji-new-140x140.png',
      backgroundImage:
        'https://th.bing.com/th?q=Astrology+Wallpaper+4K&w=120&h=120&c=1&rs=1&qlt=90&cb=1&pid=InlineBlock&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247',
    },

    {
      id: '5',
      name: 'PARAM',
      title: 'Daily Predictions',
      time: 'Today, 11:30 AM',
      image:
        'https://astrowaniindia.com/wp-content/uploads/2024/07/Pandit-ji-new-140x140.png',
      backgroundImage:
        'https://th.bing.com/th?q=Astrology+Wallpaper+4K&w=120&h=120&c=1&rs=1&qlt=90&cb=1&pid=InlineBlock&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247',
    },
    {
      id: '6',
      name: 'Taro Renu',
      title: 'Tarot Reading',
      time: 'Today, 11:08 AM',
      image:
        'https://astrowaniindia.com/wp-content/uploads/2024/07/Pandit-ji-new-140x140.png',
      backgroundImage:
        'https://th.bing.com/th?q=Astrology+Wallpaper+4K&w=120&h=120&c=1&rs=1&qlt=90&cb=1&pid=InlineBlock&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247',
    },
    {
      id: '7',
      name: 'Taro Renu',
      title: 'Tarot Reading',
      time: 'Today, 11:08 AM',
      image:
        'https://astrowaniindia.com/wp-content/uploads/2024/07/Pandit-ji-new-140x140.png',
      backgroundImage:
        'https://th.bing.com/th?q=Astrology+Wallpaper+4K&w=120&h=120&c=1&rs=1&qlt=90&cb=1&pid=InlineBlock&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247',
    },
    {
      id: '8',
      name: 'Taro Renu',
      title: 'Tarot Reading',
      time: 'Today, 11:08 AM',
      image:
        'https://astrowaniindia.com/wp-content/uploads/2024/07/Pandit-ji-new-140x140.png',
      backgroundImage:
        'https://th.bing.com/th?q=Astrology+Wallpaper+4K&w=120&h=120&c=1&rs=1&qlt=90&cb=1&pid=InlineBlock&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247',
    },
    // Add more items as needed
  ];

  const [liveAstro, setLiveAstro] = useState([]);
  const [loading, setLoading] = useState(true)

  const getLiveAstro = async () => {
    return await Instance.get(`/api/astrologers/liveAstrologers`).then((response) => {
      // console.log("response: ", response?.data?.data);
      setLiveAstro(response.data.data)
      setLoading(false)
    }).catch((error) => {
      console.log("getSpecialAstrology: ", error);
      setLoading(false)
    })
  }

  useEffect(() => {
    getLiveAstro()
  }, [loading])

  const handlePress = (item) => {
    navigation.navigate('AstrologerInfo', { person: item });
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => handlePress(item)}>
      <ImageBackground source={{ uri: item.backgroundImage || 'https://th.bing.com/th?q=Astrology+Wallpaper+4K&w=120&h=120&c=1&rs=1&qlt=90&cb=1&pid=InlineBlock&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247' }} style={styles.imageBackground}>
        <View style={styles.overlay} />
        <View style={styles.content}>
          <Image source={{ uri: item.profileImage || item.image }} style={styles.profileImage} />
          <View style={styles.details}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.title}>{item.title || item.specialty || 'Vedic Astrology'}</Text>
            <Text style={styles.time}>{item.time || 'Live Now'}</Text>
            <TouchableOpacity style={styles.joinButton} onPress={() => handlePress(item)}>
              <Text style={styles.joinButtonText}>Join Now</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.liveIndicator}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList data={liveAstro} renderItem={renderItem} keyExtractor={item => item.id} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(10),
  },
  card: {
    marginBottom: verticalScale(15),
    borderRadius: moderateScale(10),
    overflow: 'hidden',
  },
  imageBackground: {
    width: '100%',
    height: verticalScale(110),
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: scale(90),
    height: verticalScale(110),
    borderRadius: moderateScale(10),
  },
  details: {
    flex: 1,
    marginLeft: scale(10),
  },
  name: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: '#fff',
    marginBottom: verticalScale(3),
  },
  title: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
    color: '#fff',
  },
  time: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',

    color: '#ccc',
    color: 'orange',
    marginVertical: verticalScale(8),
  },
  joinButton: {
    backgroundColor: '#28A745',
    borderRadius: moderateScale(5),
    justifyContent: 'center',
    alignItems: 'center',
    width: scale(75),
    height: verticalScale(25),
  },
  joinButtonText: {
    color: '#fff',
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Bold',
  },
  liveIndicator: {
    backgroundColor: '#FF0000',
    borderRadius: moderateScale(3),
    paddingVertical: verticalScale(3),
    paddingHorizontal: scale(7),
    alignSelf: 'flex-start',
  },
  liveText: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
  },
});

export default Live;
