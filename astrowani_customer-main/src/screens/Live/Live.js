import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, ImageBackground, TouchableOpacity, FlatList, StyleSheet, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import { supabase } from '../../api/SupabaseClient';
import { ensureProfileComplete } from '../../utils/profileGate';

const Live = ({ navigation }) => {
  const [liveAstro, setLiveAstro] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredData = React.useMemo(() => {
    if (!searchQuery || !liveAstro) return liveAstro;
    const query = searchQuery.toLowerCase();
    return liveAstro.filter(item => {
      const nameMatch = item.name?.toLowerCase().includes(query);
      const specMatch = item.specialties?.[0]?.name?.toLowerCase().includes(query);
      return nameMatch || specMatch;
    });
  }, [liveAstro, searchQuery]);

  // Only astrologers actually broadcasting right now.
  const getLiveAstro = useCallback(async () => {
    try {
      const response = await Instance.get(`/api/live/active`);
      setLiveAstro(response.data.data || []);
    } catch (error) {
      console.log('getLiveAstro error:', error?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { getLiveAstro(); }, [getLiveAstro]));

  // Live sync — refresh when a session starts/ends (unique channel per mount).
  useEffect(() => {
    const channel = supabase
      .channel(`live-list-${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions' }, () => getLiveAstro())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [getLiveAstro]);

  const handlePress = async (item) => {
    if (!(await ensureProfileComplete(navigation))) return;
    navigation.navigate('LiveViewerScreen', { sessionId: item.sessionId, astrologer: item });
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => handlePress(item)}>
      <ImageBackground
        source={{ uri: 'https://th.bing.com/th?q=Astrology+Wallpaper+4K&w=120&h=120&c=1&rs=1&qlt=90&cb=1&pid=InlineBlock&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247' }}
        style={styles.imageBackground}
        imageStyle={styles.imageBackgroundImage}
      >
        <View style={styles.overlay} />

        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>

        <View style={styles.content}>
          <Image source={{ uri: item.profileImage }} style={styles.profileImage} />
          <View style={styles.details}>
            <Text style={styles.name} numberOfLines={1}>{item.name || 'Astrologer'}</Text>
            <Text style={styles.title} numberOfLines={1}>{item.specialties?.[0]?.name || 'Vedic Astrology'}</Text>

            <Text style={styles.time}>
              <MaterialIcons name="visibility" size={moderateScale(12)} color={COLORS.AstroGold} /> {item.viewerCount || 0} watching
            </Text>

            <TouchableOpacity style={styles.joinButton} onPress={() => handlePress(item)}>
              <MaterialIcons name="play-circle-outline" size={moderateScale(16)} color="#fff" style={{marginRight: 4}} />
              <Text style={styles.joinButtonText}>Join Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={moderateScale(24)} color={COLORS.AstroMaroon} />
        <TextInput
           style={styles.searchInput}
           placeholder="Search live sessions..."
           value={searchQuery}
           onChangeText={setSearchQuery}
           placeholderTextColor={COLORS.AstroMaroon}
        />
      </View>
      <FlatList
        data={filteredData}
        renderItem={renderItem}
        keyExtractor={item => String(item.sessionId || item._id)}
        contentContainerStyle={{paddingBottom: verticalScale(85), paddingTop: verticalScale(5)}}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyBox}>
              <MaterialIcons name="live-tv" size={moderateScale(40)} color={COLORS.AstroMaroon} />
              <Text style={styles.emptyText}>No astrologers are live right now.</Text>
            </View>
          )
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
    paddingHorizontal: scale(15),
    paddingTop: verticalScale(15),
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginBottom: verticalScale(15),
    borderRadius: moderateScale(25),
    paddingHorizontal: scale(15),
    elevation: 4,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(89, 42, 25, 0.1)',
  },
  searchInput: {
    flex: 1,
    height: verticalScale(45),
    marginLeft: scale(10),
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(15),
  },
  card: {
    marginBottom: verticalScale(15),
    borderRadius: moderateScale(16),
    elevation: 6,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    backgroundColor: COLORS.AstroMaroon,
  },
  imageBackground: {
    width: '100%',
    justifyContent: 'center',
  },
  imageBackgroundImage: {
    borderRadius: moderateScale(16),
    opacity: 0.8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: moderateScale(16),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(10),
  },
  profileImage: {
    width: scale(90),
    height: verticalScale(110),
    borderRadius: moderateScale(12),
    borderWidth: 1.5,
    borderColor: COLORS.AstroGold,
  },
  details: {
    flex: 1,
    marginLeft: scale(15),
    justifyContent: 'center',
  },
  name: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    color: '#fff',
    marginBottom: verticalScale(4),
    fontWeight: 'bold',
  },
  title: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#E0E0E0',
  },
  time: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroGold,
    marginVertical: verticalScale(8),
  },
  joinButton: {
    backgroundColor: '#28A745',
    borderRadius: moderateScale(25),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(6),
    alignSelf: 'flex-start',
    elevation: 3,
    shadowColor: '#28A745',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
  },
  liveIndicator: {
    position: 'absolute',
    top: scale(12),
    right: scale(12),
    backgroundColor: '#FF0000',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(4),
    paddingHorizontal: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    elevation: 4,
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  liveDot: {
    width: scale(6),
    height: scale(6),
    borderRadius: scale(3),
    backgroundColor: '#fff',
    marginRight: scale(4),
  },
  liveText: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(11),
    fontWeight: 'bold',
  },
  emptyBox: {
    alignItems: 'center',
    marginTop: verticalScale(80),
  },
  emptyText: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(15),
    marginTop: verticalScale(12),
    fontFamily: 'Lato-Regular',
  },
});

export default Live;
