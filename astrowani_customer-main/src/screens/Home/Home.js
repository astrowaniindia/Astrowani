import React, {useState, useEffect, act, useTransition} from 'react';
import {
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
  Modal,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Alert,
  RefreshControl,
  Animated
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FastImage from 'react-native-fast-image';
import Swiper from 'react-native-swiper';
import Astrologers, {LiveAstrologers, Reviews, services} from './Astrologers';
import Instance from '../../api/ApiCall';
import FreeServicesScreen from '../drawerScreens/FreeSeviceScreen/FreeServicesScreen';
import HomeRemedies from '../Remedies/HomeRemedies';
import CustomerReview from './Review';
import Remedies from '../Remedies/Remedies';
import axios from 'axios';
import { showAlert } from '../../Component/CustomAlert';
import { supabase } from '../../api/SupabaseClient';
import io from 'socket.io-client';
import { LanguageContext } from '../../context/LanguageContext';

const FadeBanner = ({ banners }) => {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!banners || banners.length <= 1) return;
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0.2, // slightly dim instead of pitch black
        duration: 500, // half-second fade out
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500, // half-second fade in
          useNativeDriver: true,
        }).start();
      });
    }, 4000); // Wait 4 seconds before transitioning
    return () => clearInterval(interval);
  }, [banners.length]);

  if (!banners || banners.length === 0) return null;

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <Image
        source={{ uri: banners[currentIndex]?.imageUrl }}
        style={{ width: '100%', height: '100%', borderRadius: 15 }}
        resizeMode="cover"
      />
    </Animated.View>
  );
};

const Home = ({navigation}) => {
  const { t } = React.useContext(LanguageContext);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedReview, setSelectedReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingBlogs, setLoadingBlogs] = useState(true);
  const [loadingAstrologer, setLoadingAstrologer] = useState(true);
  const [topRatedReviews, setTopRatedReviews] = useState([]);
  const [error, setError] = useState(null);
  const [errroBlogs, setErrorBlogs] = useState(null);
  const [errorAstrologer, setErrorAstrologer] = useState(null);
  const [categories, setCategories] = useState(null);
  const [blogs, setBlogs] = useState(null);
  const [blogsToshow, setBlogsToShow] = useState(null);
  const [astrologer, setAstrologer] = useState(null);
  const [astrologerToShow, setAstrologerToShow] = useState(null);
  const [errorReview, setErrorReview] = useState(null);
  const [loadingReview, setLoadingReview] = useState(true);
  const [banners, setBanners] = useState([]);
  const [liveAstro, setLiveAstro] = useState([]);
  const [thought, setThought] = useState();
  const [user, setUser] = useState(null);

  // const [categories, setCategories] = useState([])
  // const [topReviews, setTopReviews] = useState(null);
  const {height} = Dimensions.get('window');
  // console.log("b;log to showww", blogsToshow);
  const images = [
    require('../../assets/images/mainlogo.jpeg'),
    require('../../assets/images/banner.jpeg'),
  ];
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingAstroName, setWaitingAstroName] = useState('');

  const listRef = React.useRef(null);
  const scrollOffset = React.useRef(0);
  const isAutoScrolling = React.useRef(true);
  
  const loopedAstrologers = React.useMemo(() => {
    if (!astrologerToShow) return [];
    return [...astrologerToShow, ...astrologerToShow, ...astrologerToShow, ...astrologerToShow, ...astrologerToShow, ...astrologerToShow, ...astrologerToShow, ...astrologerToShow];
  }, [astrologerToShow]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (isAutoScrolling.current && listRef.current && loopedAstrologers.length > 0) {
        scrollOffset.current += 0.5; 
        try {
          listRef.current.scrollToOffset({ offset: scrollOffset.current, animated: false });
        } catch (e) {}
      }
    }, 16);
    return () => clearInterval(timer);
  }, [loopedAstrologers.length]);

  const getRoomTokenWebCall = async item => {
    if (!user || Object.keys(user).length === 0 || !user.email || user.email.trim() === '') {
      showAlert('Profile Required', 'Please complete your profile to continue.', 'error', () => {
        navigation.navigate('UserProfileScreen', { user });
      }, 'Complete Profile');
      return null;
    }
    try {
      const token = await AsyncStorage.getItem('token');
      const userToken = await AsyncStorage.getItem('userToken');
      const userEntireData = JSON.parse(await AsyncStorage.getItem('userData'));
      
      setIsWaiting(true);
      setWaitingAstroName(item.name);

      const response = await axios.post(
        `http://10.0.2.2:4500/api/call/initiate`,
        {
          receiverId: item.userId,
          callType: 'video',
          callerRole: 'customer',
          name: item.name
        },
        {
          headers: {Authorization: `Bearer ${token}`},
        },
      );
      
      if (response.status === 200) {
        const roomTokenData = response.data.data?.token?.token || response.data.token?.token || response.data.token;
        const vendorTokenData = response.data.data?.vendorToken || roomTokenData;
        const roomIdData = response.data.data?.roomId || response.data.roomId;
        
        const { data: requestData, error: requestError } = await supabase
          .from('call_requests')
          .insert([{
            customer_id: userEntireData.id,
            astrologer_id: item.userId,
            customer_name: userEntireData.name || 'Customer',
            call_type: 'video',
            status: 'pending',
            room_id: roomIdData,
            room_token: vendorTokenData
          }])
          .select()
          .single();

        if (requestError) {
          setIsWaiting(false);
          Alert.alert('Error', 'Failed to send request to astrologer.');
          return null;
        }

        const socket = io('http://10.0.2.2:4500');
        socket.on('connect', () => {
          socket.emit('join_room', userEntireData.id);
          
          socket.emit('initiate_call', {
            astrologer_id: item.userId,
            customer_id: userEntireData.id,
            customer_name: userEntireData.name || 'Customer',
            call_type: 'video',
            room_id: roomIdData,
            room_token: vendorTokenData
          });
        });

        socket.on('call_accepted', (data) => {
          setIsWaiting(false);
          socket.disconnect();
          navigation.navigate("EnxConferenceScreen", { token: roomTokenData });
        });

        socket.on('call_rejected', (data) => {
          setIsWaiting(false);
          socket.disconnect();
          Alert.alert('Declined', `${item.name} is currently busy and declined the call.`);
        });

        return response.data.token;
      } else {
        setIsWaiting(false);
        Alert.alert('Error', response.data.error || 'Unexpected Error');
        return null;
      }
    } catch (error) {
      setIsWaiting(false);
      Alert.alert('Error', 'Failed to initiate call');
      return null;
    }
  };
  const getBanner = async () => {
    return await Instance(`/api/banners/all`)
      .then(response => {
        // console.log("response: ", response?.data);
        setBanners(response?.data?.data);
      })
      .catch(error => {
        console.log('error on getBanner: ', error);
      });
  };
  const fetchUserProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      if (!token) {
        throw new Error('Token not found');
      }

      const response = await Instance.get('/api/users/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data) {
        const userData = response.data.data;
        // Check if userData is empty object
        if (Object.keys(userData).length === 0) {
          // navigation.navigate('UserProfileScreen', {user: userData});
          // return;
        }
        // ✅ Check if email is missing, null, undefined, or empty string
        if (!userData.email || userData.email.trim() === '') {
          // navigation.navigate('UserProfileScreen', {user: userData});
          // return;
        }
      setUser(userData);
      // Store user data in AsyncStorage for chat screens
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      console.log(userData, 'this is user data++++++++++++++');
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setLoading(false);
      // navigation.navigate('UserProfileScreen');
    }
  };

  const getThoutsOfTheDay = async () => {
    return await Instance(`/api/thoughts/latest`)
      .then(response => {
        // console.log("response: ", response?.data);
        setThought(response?.data);
        setLoading(false);
      })
      .catch(error => {
        console.log('error on getThoutsOfTheDay: ', error);
        setLoading(false);
      });
  };
    const fetchCategories = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          throw new Error('Token not found');
        }
        const response = await Instance.get('/api/categories', {
          headers: {Authorization: `Bearer ${token}`},
        });

        setCategories(response?.data?.categories);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    const fetchBlogs = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');
        const response = await Instance.get('/api/blogs', {
          headers: {Authorization: `Bearer ${token}`},
        });
        const sliceData =
          response.data.length >= 6 ? response.data.slice(0, 6) : response.data;
        setBlogsToShow(sliceData);
        setBlogs(response.data);
      } catch (err) {
        setErrorBlogs(err.message);
      } finally {
        setLoadingBlogs(false);
      }
    };
    const fetchAstrologer = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');
        const response = await Instance.get('/api/astrologers', {
          headers: {Authorization: `Bearer ${token}`},
        });
        const astroResponse = response.data.data;
        const sliceData =
          astroResponse.length >= 7 ? astroResponse.slice(0, 7) : astroResponse;
        setAstrologerToShow(sliceData);
        setAstrologer(astroResponse);
      } catch (err) {
        setErrorAstrologer(err.message);
      } finally {
        setLoadingAstrologer(false);
      }
    };

    const getLiveAstro = async () => {
      return await Instance.get(`/api/astrologers/liveAstrologers`)
        .then(response => {
          setLiveAstro(response.data.data);
          setLoading(false);
        })
        .catch(error => {
          console.log('getSpecialAstrology: ', error);
          setLoading(false);
        });
    };

    const fetchTopReviews = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');

        const response = await Instance.get(
          '/api/reviews/astrologers/reviews',
          {
            headers: {Authorization: `Bearer ${token}`},
          }
        );

        const sortedReviews = response.data.sort((a, b) => b.rating - a.rating);

        const topReviews =
          sortedReviews.length >= 5 ? sortedReviews.slice(0, 5) : sortedReviews;

        setTopRatedReviews(topReviews);
      } catch (err) {
        setErrorReview(err.message);
      } finally {
        setLoadingReview(false);
      }
    };

  const loadAllData = () => {
    getBanner();
    getThoutsOfTheDay();
    fetchUserProfile();
    fetchAstrologer();
    fetchCategories();
    fetchBlogs();
    fetchTopReviews();
    getLiveAstro();
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    loadAllData();
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  const handleMorePress = review => {
    setSelectedReview(review);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedReview(null);
  };
  const handleSearch = () => {
    navigation.navigate('SearchScreen', {data: astrologer});
  };

  const openAstrologer = (person) => {
    console.log(person,"%%%%%%%%%%%%%%%%%");
    navigation.navigate('AstrologerInfo', {person: person});
  };

  const isProfileComplete = () => {
    if (!user || Object.keys(user).length === 0) return false;
    if (!user.email || user.email.trim() === '') return false;
    // Add any other required fields here
    return true;
  };

  const handleChatPress = async (item) => {
    if (!isProfileComplete()) {
      showAlert('Profile Required', 'Please complete your profile to continue.', 'error', () => {
        navigation.navigate('UserProfileScreen', { user });
      }, 'Complete Profile');
      return;
    }
    console.log("Starting chat from Home with astrologer:", item._id);
    console.log(item,"this is items")
    navigation.navigate('PersonToPersonChat', {
      person: item,
    });
  };

  const handleServiceSelect = service => {
    if (service.title === "Today's Panchang") {
      navigation.navigate('PanchangScreen');
    } else if (service.title === 'Janam Kundali') {
      navigation.navigate('JanamKundaliScreen');
    } else if (service.title === 'Kundali Match') {
      navigation.navigate('KundaliMatchScreen');
    } else if (service.title === 'Free Horoscope') {
      navigation.navigate('Horoscope');
    } else if (service.title === 'Shubh Muhurat') {
      navigation.navigate('ShubhMuhurat');
    } else if (service.title === 'Vrat and Upvaas') {
      navigation.navigate('VrataUpvaas');
    }
  };

  const renderAstrologerList = ({item}) => {
    console.log(item, 'this is item############');
    const languages = item.language?.join(', ');
    return (
      <TouchableOpacity
        onPress={() => openAstrologer(item)}
        style={styles.AstrologerCard}>
        <Image
          resizeMode="contain"
          source={{
            uri:
              item.profileImage ||
              'https://cdn-icons-png.flaticon.com/128/3135/3135715.png',
          }}
          style={styles.AstroImage}
        />
        <View style={styles.infoWrapper}>
          <Text style={styles.name}>{item.name || 'Name'}</Text>
          <Text style={styles.specialty}>
            {item.specialties[0]?.name || 'vedic Astrology'}
          </Text>
          <Text style={styles.exp}>Exp: {item.experience || '0'} years</Text>
          <Text style={styles.language}>{languages || 'hindi'}</Text>
        </View>
        <View style={styles.btnView}>
          <Text style={[styles.charge, {color: 'green'}]}>
            {item.isFree ? 'Free' : `₹${item.chargePerMinute || 0}/min`}
          </Text>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
            <TouchableOpacity
              onPress={() => handleChatPress(item)}
              style={styles.chatBtn}>
              <Text style={styles.chatBtnTxt}>{t('chat')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              // onPress={() =>
              //   navigation.navigate('EnxJoinScreen', {
              //     userId: item._id,
              //     callType: 'voice',
              //     callerRole: 'sender',
              //     userName: item.name,
              //   })
              // }
              onPress={() => {
                getRoomTokenWebCall(item);
              }}
              style={styles.callButton}>
              <Text style={styles.chatBtnTxt}>{t('call')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderReviewList = ({item}) => {
    return (
      <TouchableOpacity
        onPress={() => handleMorePress(item)}
        style={styles.ReviewCard}>
        <View style={styles.reviewImageView}>
          <Image
            source={{
              uri:
                item.user?.profilePic ||
                'https://cdn-icons-png.flaticon.com/128/3135/3135715.png',
            }}
            style={styles.ReviewerImage}
          />

          <View style={styles.starsContainer}>
            {item.rating
              ? Array.from({length: item.rating}).map((_, index) => (
                  <MaterialIcons
                    key={index}
                    name="star"
                    size={moderateScale(14)}
                    color="orange"
                    style={styles.star}
                  />
                ))
              : null}
          </View>
        </View>

        <View style={styles.ReviewWrapper}>
          <View>
            <Text style={styles.reviewer}>
              {item.user?.firstName || 'Anonymous'}
            </Text>
            <Text style={styles.date}>{item?.createdAt || '3 may 2024'}</Text>
          </View>
          <Text style={styles.review} numberOfLines={3} ellipsizeMode="tail">
            {item.comment || 'no comment'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const AstrologerItem = ({astrologer}) => {
    return (
      <TouchableOpacity style={styles.AstroBackWrapper}>
        <Image
          source={{uri: astrologer.profileImage || astrologer.image}}
          style={styles.liveAstrologerimg}
        />
        <View
          style={[
            styles.livebtn,
            astrologer.live ? styles.live : styles.scheduled,
          ]}>
          <Text style={astrologer.live ? styles.livetxt : styles.scheduledtxt}>
            {astrologer.live ? t('live') : t('scheduled')}
          </Text>
        </View>
        <View style={styles.astroNameview}>
          <Text style={styles.livename}>{astrologer.name}</Text>
          <Text style={styles.topic}>{astrologer.topic}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const BlogItem = ({blog}) => {
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('BlogScreen', {data: blog})}
        style={styles.blogCard}>
        <Image style={styles.blogImg} source={{uri: blog.thumbnail}} />
        <Text style={styles.blogTitle}>{blog.title}</Text>
        <Text style={styles.blogContent} numberOfLines={2} ellipsizeMode="tail">
          {blog.metaDescription}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{flex: 1, backgroundColor: COLORS.AstroMaroon}}>
      <ScrollView 
        style={{flex: 1}}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.AstroMaroon]} />
        }
      >
        <View style={styles.searchBtnView}>
          <TouchableOpacity onPress={handleSearch} style={styles.searchBtn}>
            <MaterialIcons name="search" size={24} color="#800000" />
            <Text style={styles.searchTxt}>{t('search')}</Text>
          </TouchableOpacity>
        </View>
        <View
          style={{
            backgroundColor: COLORS.AstroMaroon,
            width: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            paddingBottom: 40,
            paddingTop: 5,
            paddingHorizontal: '5%',
          }}>
          <Text style={[styles.topAstrologerTxt, {color: 'white', textAlign: 'center'}]}>
            {thought?.thoughtText || t('welcome')}
          </Text>
        </View>

        <View style={{
          backgroundColor: COLORS.AstroSoftOrange, 
          flex: 1, 
          paddingBottom: 50,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          marginTop: -25,
          paddingTop: 20,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.1,
          shadowRadius: 5
        }}>
          <View style={{height: 150, marginHorizontal: 15, borderRadius: 15, overflow: 'hidden'}}>
            <FadeBanner banners={banners} />
          </View>

          <View style={styles.topAstrologers}>
            <Text style={styles.topAstrologerTxt}>{t('bestAstrologers')}</Text>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => navigation.navigate('Chat')}>
              <Text style={styles.viewAll}>{t('viewAll')}</Text>
            </TouchableOpacity>
          </View>
        {loadingAstrologer ? (
          <View style={styles.indicator}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        ) : errorAstrologer ? (
          <Text style={styles.errorText}>{errorAstrologer}</Text>
        ) : (
          <FlatList
            ref={listRef}
            data={loopedAstrologers}
            keyExtractor={(item, index) => item._id.toString() + index.toString()}
            renderItem={renderAstrologerList}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.astrologerList}
            onScroll={(e) => {
              if (!isAutoScrolling.current) {
                scrollOffset.current = e.nativeEvent.contentOffset.x;
              }
            }}
            scrollEventThrottle={16}
            onScrollBeginDrag={() => { isAutoScrolling.current = false; }}
            onScrollEndDrag={() => { isAutoScrolling.current = true; }}
            onMomentumScrollBegin={() => { isAutoScrolling.current = false; }}
            onMomentumScrollEnd={() => { isAutoScrolling.current = true; }}
          />
        )}

        <View style={styles.separator} />

        <Text style={styles.CategoryTitle}>Astrowani's Categories</Text>
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.CategoryView}>
              {loading ? (
                <View style={styles.indicator}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                </View>
              ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : (
                categories?.length > 0 &&
                categories?.map((item, index) => (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Chat')}
                    key={index}
                    style={styles.category}>
                    <FastImage
                      style={styles.categoryImg}
                      resizeMode="cover"
                      source={{
                        uri:
                          item.image ||
                          'https://th.bing.com/th/id/OIP.u8mYbwil7gU0BZejsy4ySAAAAA?w=276&h=176&c=7&r=0&o=5&pid=1.7',
                        priority: FastImage.priority.normal,
                      }}
                    />
                    <Text style={styles.categoryName}>{item.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>
        </View>

        <View style={styles.separator} />

        <View style={styles.topAstrologers}>
          <Text style={styles.topAstrologerTxt}>{t('remedies')}</Text>
        </View>

        <HomeRemedies navigation={navigation} />

        <View style={styles.separator} />

        <View style={styles.topAstrologers}>
          <Text style={styles.topAstrologerTxt}>Live Astrologers</Text>
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={() => navigation.navigate('Live')}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={liveAstro}
          renderItem={({item}) => <AstrologerItem astrologer={item} />}
          keyExtractor={item => item.name}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.liveAstrologersView}
        />
        
        <View style={styles.separator} />

        <View style={styles.topAstrologers}>
          <Text style={styles.topAstrologerTxt}>Free Services</Text>
        </View>
        <FreeServicesScreen
          services={services}
          onServiceSelect={handleServiceSelect}
        />

        <View style={styles.separator} />

        <View style={[styles.topAstrologers, styles.boxedHeader]}>
          <Text style={styles.topAstrologerTxt}>Astrowani's Blog</Text>
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={() => navigation.navigate('BlogList', {data: blogs})}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>
        {loadingBlogs ? (
          <View style={styles.indicator}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        ) : errroBlogs ? (
          <Text style={styles.errorText}>{errroBlogs}</Text>
        ) : (
          <FlatList
            data={blogs?.data}
            renderItem={({item}) => <BlogItem blog={item} />}
            keyExtractor={item => item._id.toString()}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.BlogView}
          />
        )}
        <CustomerReview />
        <Remedies />

        <View style={styles.reviewsBox}>
          <View style={[styles.customerReviews, {marginTop: verticalScale(15)}]}>
            <View style={{alignItems: 'center', marginBottom: verticalScale(20)}}>
              <MaterialIcons name="format-quote" size={moderateScale(35)} color={COLORS.AstroSoftOrange} />
              <Text style={[styles.topAstrologerTxt, {color: 'white', fontSize: moderateScale(20), marginTop: verticalScale(5)}]}>What Our Clients Say</Text>
              <Text style={{color: COLORS.AstroSoftOrange, fontFamily: 'Lato-Regular', fontSize: moderateScale(12), marginTop: verticalScale(5)}}>Discover why thousands trust Astrowani</Text>
            </View>
            
            {loadingReview ? (
              <View style={styles.indicator}>
                <ActivityIndicator size="small" color={'white'} />
              </View>
            ) : errorReview ? (
              <Text style={styles.errorText}>{errorReview}</Text>
            ) : topRatedReviews && topRatedReviews.length > 0 ? (
              <FlatList
                data={topRatedReviews}
                renderItem={renderReviewList}
                keyExtractor={item => item._id.toString()}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.ReviewsList}
              />
            ) : (
              <View style={styles.emptyReviewCard}>
                <MaterialIcons name="rate-review" size={moderateScale(30)} color={COLORS.AstroMaroon} />
                <Text style={styles.emptyReviewTxt}>No reviews available yet.</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.darkBottomSection}>
          <View style={[styles.footer, {backgroundColor: 'transparent', paddingBottom: 0}]}>
            <View style={{alignItems: 'center', marginBottom: verticalScale(15), marginTop: verticalScale(20)}}>
              <MaterialIcons name="stars" size={moderateScale(35)} color={COLORS.AstroSoftOrange} />
              <Text style={[styles.footerTitle, {color: 'white', fontSize: moderateScale(18), textAlign: 'center', marginTop: verticalScale(8)}]}>
                Why Astrowani Is Best For Astrology?
              </Text>
            </View>
            <View style={styles.footericonView}>
              <Text style={[styles.why, {color: '#f0f0f0', textAlign: 'center', lineHeight: verticalScale(24), fontSize: moderateScale(13)}]}>
                Astrowani reveals the destiny that Stars has designed for us.
                Astrowani is a proven science with its methods and way of
                interpreting the influence of stars and planets on earthly affairs
                and human destinies. Astrowani, with its scientific method of
                calculation and prediction of actual events, is approving enough
                to make people start believing in it. And it has been doing the
                same since the early Vedic period.
              </Text>
            </View>
          </View>
        </View>

        {selectedReview && (
          <Modal
            visible={modalVisible}
            transparent={true}
            animationType="slide"
            onRequestClose={closeModal}>
            <View style={styles.modalBackground}>
              <View style={styles.modalContainer}>
                <Image
                  source={{
                    uri:
                      selectedReview.user?.profilePic ||
                      'https://cdn-icons-png.flaticon.com/128/3135/3135715.png',
                  }}
                  style={styles.modalImage}
                />
                <Text style={styles.modalName}>
                  {selectedReview.user?.firstName || 'Anonymous'}
                </Text>

                <View style={styles.starsContainer}>
                  {selectedReview.rating
                    ? Array.from({length: selectedReview.rating}).map(
                        (_, index) => (
                          <MaterialIcons
                            key={index}
                            name="star"
                            size={moderateScale(18)}
                            color={COLORS.AstroGold}
                            style={styles.star}
                          />
                        ),
                      )
                    : null}
                </View>

                <Text style={styles.modalReview}>
                  {selectedReview.comment || 'no comment'}
                </Text>
                <TouchableOpacity
                  onPress={closeModal}
                  style={styles.closeIconWrapper}>
                  <MaterialIcons
                    name="close"
                    size={moderateScale(24)}
                    color="black"
                    style={styles.closeButton}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
        </View>
      </ScrollView>
      <View style={styles.fixedBtnView}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Chat')}
          style={styles.fixedBtn}>
          <MaterialIcons name="wechat" size={22} color={COLORS.AstroMaroon} />
          <Text style={styles.fixedBtnTxt}>Chat with Astrologer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('VoiceCallScreen')}
          style={styles.fixedBtn}>
          <MaterialIcons name="add-call" size={22} color={COLORS.AstroMaroon} />
          <Text style={styles.fixedBtnTxt}>Talk To Astrologer</Text>
        </TouchableOpacity>
      </View>

      <Modal transparent={true} visible={isWaiting} animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ 
            width: '85%', 
            backgroundColor: COLORS.AstroMaroon, 
            borderRadius: 15, 
            padding: 25, 
            alignItems: 'center',
            borderWidth: 1,
            borderColor: COLORS.AstroSoftOrange
          }}>
            <ActivityIndicator size="large" color={COLORS.AstroGold} />
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.AstroGold, marginTop: 20, marginBottom: 10 }}>Request Sent</Text>
            <Text style={{ fontSize: 16, color: COLORS.AstroSoftOrange, textAlign: 'center', marginBottom: 25, lineHeight: 22 }}>
              Waiting for {waitingAstroName} to accept your request...
            </Text>
            <TouchableOpacity 
              style={{ 
                backgroundColor: COLORS.AstroSoftOrange, 
                paddingHorizontal: 30, 
                paddingVertical: 12, 
                borderRadius: 25,
                width: '100%',
                alignItems: 'center'
              }}
              onPress={() => setIsWaiting(false)}
            >
              <Text style={{ color: COLORS.AstroMaroon, fontWeight: 'bold', fontSize: 16 }}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Home;

const styles = StyleSheet.create({
  separator: {
    height: verticalScale(1),
    backgroundColor: COLORS.AstroMaroon,
    marginHorizontal: scale(15),
    marginVertical: verticalScale(10),
    opacity: 0.15,
  },
  main: {backgroundColor: 'white'},
  searchTxt: {
    paddingHorizontal: scale(5),
  },
  searchBtnView: {
    backgroundColor: COLORS.AstroMaroon,
    marginTop: -2,
  },
  searchBtn: {
    backgroundColor: COLORS.white,
    marginHorizontal: scale(15),
    marginVertical: verticalScale(12),
    borderRadius: moderateScale(25),
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(12),
    alignItems: 'center',
    flexDirection: 'row',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  backgroundImg: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  imageBackWrapper: {
    width: scale(320),
    marginHorizontal: scale(15),
    marginVertical: verticalScale(15),
    height: verticalScale(120),
    borderRadius: moderateScale(10),
    overflow: 'hidden',
  },
  textWrapper: {
    width: scale(180),
    marginVertical: verticalScale(13),
  },
  freetext: {
    color: 'white',
    textAlign: 'center',
    fontSize: moderateScale(18),
    marginHorizontal: scale(5),
    fontFamily: 'Poppins-Bold',
    alignSelf: 'center',
    marginTop: -45,
  },
  topAstro: {
    color: 'white',
    marginHorizontal: scale(5),
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
    marginVertical: verticalScale(4),
    position: 'absolute',
    bottom: 0,
    left: moderateScale(150),
  },
  chatnowBtn: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
    height: verticalScale(18),
    width: scale(90),
    backgroundColor: 'orange',
    borderRadius: moderateScale(20),
    // marginTop: verticalScale(30),
    marginHorizontal: scale(10),
  },
  callnowBtn: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
    height: verticalScale(18),
    width: scale(90),
    backgroundColor: 'red',
    borderRadius: moderateScale(20),
    // marginTop: verticalScale(30),
    marginHorizontal: scale(10),
  },
  chatnowTxt: {
    color: 'black',

    fontSize: moderateScale(10),
    fontFamily: 'Poppins-Bold',
  },
  topAstrologers: {
    marginHorizontal: scale(15),
    marginVertical: verticalScale(4),
    marginTop: verticalScale(25),
    marginBottom: verticalScale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customerReviews: {
    marginHorizontal: scale(15),
    marginVertical: verticalScale(4),
    marginTop: verticalScale(25),
    marginBottom: verticalScale(10),
    justifyContent: 'space-between',
  },
  topAstrologerTxt: {
    color: 'black',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(16),
  },
  boxedHeader: {
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(12),
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  viewAllBtn: {
    paddingHorizontal: scale(18),
    paddingVertical: verticalScale(6),
    backgroundColor: COLORS.AstroGold,
    borderRadius: moderateScale(25),
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  viewAll: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
  },
  astrologerList: {
    paddingHorizontal: scale(15),
    paddingBottom: verticalScale(10),
  },
  ReviewsList: {
    paddingVertical: verticalScale(3),
  },

  AstroImage: {
    width: scale(80),
    height: scale(80),
    borderRadius: moderateScale(40),
    borderWidth: 3,
    borderColor: 'white',
    position: 'absolute',
    top: -verticalScale(40),
    zIndex: 10,
    backgroundColor: '#fff',
  },
  AstrologerCard: {
    alignItems: 'center',
    marginBottom: verticalScale(15),
    marginTop: verticalScale(45),
    width: scale(160),
    backgroundColor: '#fff',
    borderRadius: moderateScale(20),
    marginRight: scale(15),
    paddingBottom: verticalScale(12),
    paddingTop: verticalScale(45),
    borderWidth: 1,
    borderColor: 'white',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  infoWrapper: {
    flex: 1,
  },
  ReviewWrapper: {
    flex: 1,
    marginLeft: scale(20),
  },
  name: {
    fontFamily: 'Lato-Bold',
    color: 'black',
    fontSize: moderateScale(15),
    textAlign: 'center',
  },
  reviewer: {
    fontFamily: 'Lato-Bold',
    color: 'black',
    fontSize: moderateScale(15),
    marginBottom: verticalScale(2),
  },

  specialty: {
    color: 'black',
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(12),
    marginTop: verticalScale(1),
    marginBottom: verticalScale(4),
  },
  exp: {
    color: 'black',
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(12),
    marginBottom: verticalScale(1),
  },
  language: {
    color: 'black',
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(12),
    marginBottom: verticalScale(1),
  },

  charge: {
    color: 'gray',
    fontWeight: 'bold',
    fontSize: moderateScale(12),
    textAlign: 'center',
    marginTop: scale(5),
  },
  chatBtn: {
    backgroundColor: 'white',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(12),
    marginVertical: verticalScale(5),
    borderWidth: 1,
    borderColor: 'green',
    elevation: 1,
  },
  callButton: {
    backgroundColor: 'white',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(12),
    marginVertical: verticalScale(5),
    borderWidth: 1,
    borderColor: 'red',
    elevation: 1,
  },
  chatBtnTxt: {
    color: 'black',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(10),
  },
  ReviewCard: {
    flexDirection: 'row',
    borderRadius: moderateScale(16),
    backgroundColor: 'white',
    width: scale(250),
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    marginVertical: verticalScale(10),
    marginRight: scale(15),
    padding: moderateScale(12),
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  ReviewerImage: {
    width: scale(65),
    height: scale(65),
    borderRadius: moderateScale(50),
    borderColor: COLORS.white,
    borderWidth: scale(0.5),
  },
  reviewImageView: {
    alignItems: 'center',
    width: scale(75),
  },
  review: {
    color: 'black',
    fontFamily: 'Lato-Regular',
    width: scale(100),
    fontSize: moderateScale(12),
  },
  rating: {
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
    fontSize: moderateScale(13),
  },
  date: {
    color: COLORS.gray,
    marginBottom: verticalScale(10),
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
  },
  starsContainer: {
    flexDirection: 'row',
    marginTop: verticalScale(10),
  },
  star: {
    marginRight: scale(1), // Add space between stars if needed
  },
  moretxt: {
    color: 'red',
    marginVertical: verticalScale(8),
    width: scale(33),
    borderBottomWidth: moderateScale(0.5),
    borderBottomColor: 'red',
  },

  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: moderateScale(10),
    padding: moderateScale(20),
    alignItems: 'center',
  },
  modalImage: {
    width: scale(100),
    height: verticalScale(100),
    borderRadius: moderateScale(50),
    marginBottom: verticalScale(15),
    borderWidth: scale(0.5),
    borderColor: COLORS.AshGray,
  },
  modalName: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: 'black',
  },
  modalProfession: {
    fontSize: moderateScale(14),
    color: COLORS.AstroMaroon,
  },

  modalReview: {
    fontSize: moderateScale(14),
    color: 'black',
    textAlign: 'center',
    marginVertical: verticalScale(15),
    fontWeight: 'bold',
  },
  closeButton: {marginBottom: verticalScale(15)},
  bar: {
    width: scale(320),
    alignSelf: 'center',
    elevation: 2,

    shadowColor: COLORS.AstroMaroon,
  },
  separator: {
    borderTopWidth: moderateScale(2), // Thickness of the separator
    width: scale(320),
    marginVertical: verticalScale(13),
    alignSelf: 'center',
    borderTopColor: 'rgba(128, 0, 0, 0.1)',
  },
  CategoryTitle: {
    marginHorizontal: scale(15),
    marginTop: verticalScale(10),
    marginBottom: verticalScale(5),
    color: 'black',
    fontFamily: 'Lato-Bold',
  },
  liveAstrologersView: {
    flexDirection: 'row',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(5),
    marginVertical: verticalScale(5),
  },

  AstroBackWrapper: {
    width: scale(140),
    height: verticalScale(185),
    borderRadius: moderateScale(16),
    marginHorizontal: scale(8),
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 5,
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    marginBottom: verticalScale(10),
  },
  liveAstrologerimg: {
    width: scale(74),
    height: scale(74),
    borderRadius: moderateScale(37),
    marginVertical: verticalScale(12),
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  livebtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(4),
    height: verticalScale(15),
    marginVertical: verticalScale(3),
  },
  live: {
    backgroundColor: 'red',
    borderRadius: moderateScale(4),
    width: scale(30),
    alignSelf: 'center',
  },
  scheduled: {
    backgroundColor: 'orange',
    borderRadius: moderateScale(4),
    width: scale(60),
    alignSelf: 'center',
  },
  livetxt: {
    color: 'white',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(10),
  },
  scheduledtxt: {
    color: 'black',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(10),
  },
  astroNameview: {
    padding: scale(5),
  },
  livename: {
    color: 'black',
    fontFamily: 'Lato-Bold',
    textAlign: 'center',
  },
  topic: {
    color: 'black',
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(10),
  },
  CategoryView: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(15),
  },
  category: {
    marginHorizontal: scale(8),
    alignItems: 'center',
    width: scale(75),
  },
  categoryImg: {
    width: scale(70),
    height: scale(70),
    borderRadius: moderateScale(35),
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  categoryName: {
    color: 'black',
    fontSize: moderateScale(11),
    textAlign: 'center',
    fontFamily: 'Lato-Bold',
    marginTop: verticalScale(8),
  },
  fixedBtnView: {
    position: 'absolute',
    bottom: verticalScale(40),
    left: 0,
    right: 0,
    flexDirection: 'row',
    marginHorizontal: scale(5),
    marginVertical: verticalScale(15),
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fixedBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.AstroGold,
    borderRadius: moderateScale(30),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 6,
    marginHorizontal: scale(10),
  },
  fixedBtnTxt: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(11),
    fontFamily: 'Lato-Bold',
    marginHorizontal: scale(6),
  },
  BlogView: {
    flexDirection: 'row',
    paddingHorizontal: scale(10),
    marginVertical: verticalScale(5),
    paddingVertical: verticalScale(10),
  },
  footer: {
    marginTop: verticalScale(20),
    backgroundColor: COLORS.AstroSoftOrange,
    paddingBottom: verticalScale(75),
  },
  reviewsBox: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(24),
    marginHorizontal: scale(10),
    paddingBottom: verticalScale(20),
    paddingTop: verticalScale(10),
    marginTop: verticalScale(20),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  darkBottomSection: {
    backgroundColor: COLORS.AstroMaroon,
    borderTopLeftRadius: moderateScale(35),
    borderTopRightRadius: moderateScale(35),
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(85),
    marginTop: verticalScale(25),
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  emptyReviewCard: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(16),
    padding: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '85%',
    borderWidth: 1.5,
    borderColor: COLORS.AstroSoftOrange,
    marginVertical: verticalScale(10),
  },
  emptyReviewTxt: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    marginTop: verticalScale(10),
    fontSize: moderateScale(14),
  },
  blogCard: {
    backgroundColor: '#fff',
    width: scale(220),
    marginHorizontal: scale(8),
    borderRadius: moderateScale(16),
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 5,
    marginBottom: verticalScale(10),
  },
  blogImg: {
    width: scale(220),
    height: verticalScale(110),
    borderTopLeftRadius: moderateScale(16),
    borderTopRightRadius: moderateScale(16),
  },
  blogTitle: {
    paddingHorizontal: scale(5),
    paddingVertical: verticalScale(10),
    color: 'black',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
    textAlign: 'center',
  },
  blogContent: {
    paddingHorizontal: scale(7),
    paddingBottom: verticalScale(5),
    marginBottom: verticalScale(5),
    fontSize: moderateScale(12),
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
    color: 'gray',
  },
  moreBtn: {
    alignSelf: 'center',
  },

  footericonView: {
    flexDirection: 'row',
  },
  footerTitle: {
    marginVertical: verticalScale(20),
    textAlign: 'center',
    color: 'black',
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
  },
  verifyLogo: {
    width: scale(55),
    height: verticalScale(55),
  },
  firstsection: {
    width: scale(116),
    alignItems: 'center',
  },
  sectionTxt: {
    color: COLORS.black,
    fontFamily: 'Poppins-Regular',
    textAlign: 'center',
    fontSize: moderateScale(13),
    marginVertical: verticalScale(5),
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    paddingVertical: verticalScale(10),
  },
  indicator: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: verticalScale(10),
  },
  why: {
    textAlign: 'center',
    color: 'black',
    fontSize: moderateScale(13),
    lineHeight: verticalScale(20),
    fontFamily: 'Lato-Regular',
    marginHorizontal: scale(15),
  },
  backgroundImg: {
    flex: 1,
    resizeMode: 'cover',
    justifyContent: 'space-between',
  },

  centerTextWrapper: {
    flex: 1,
    // justifyContent: 'center',
    // alignItems: 'center',
  },

  bottomWrapper: {
    flexDirection: 'row', // or 'row' if you want text and button side-by-side
    alignItems: 'center',
    // gap: 10,
    // justifyContent: "space-between",
    padding: 5,
  },
  topAstro: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
    color: 'white',
  },

  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  chatnowBtn: {
    backgroundColor: '#B71C1C',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 5,
    paddingHorizontal: 8,
  },

  callnowBtn: {
    backgroundColor: 'orange',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 5,
    paddingHorizontal: 8,
  },
  chatnowTxt: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 10,
  },
  backgroundImg: {
    height: 200,
  },
  imageBackWrapper: {
    flex: 2,
  },
});
