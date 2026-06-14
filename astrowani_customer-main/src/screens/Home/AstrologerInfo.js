import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Share,
  Dimensions,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import AntDesign from 'react-native-vector-icons/AntDesign';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import GiftModal from '../../Component/Modal';

const { width } = Dimensions.get('window');

const AstrologerInfo = ({route, navigation}) => {
  const {person} = route.params;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFavorite, setIsFavorite] = useState(person.isFavorite || false);
  const [loading, setLoading] = useState(false);
  const [reviewloading, setReviewLoading] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewError, setReviewError] = useState('');
  const [avgRating, setAvgRating] = useState('');
  const [avgError, setAvgError] = useState('');
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);

  const handleShowAllReviews = () => {
    setShowAllReviews(true);
  };

  const reviewsToShow = showAllReviews ? reviews : reviews.slice(0, 2);

  useEffect(() => {
    const fetchFavorites = async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');

        const response = await Instance.get('/api/favoriteAstrologer', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const favoriteAstrologers = response.data.favoriteAstrologer || [];
        const isPersonFavorite = favoriteAstrologers.some(
          favAstrologer => favAstrologer._id === person._id,
        );

        setIsFavorite(isPersonFavorite);
      } catch (err) {
        console.log('Error fetching favorite astrologers:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchReviews = async () => {
      setReviewLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');

        const response = await Instance.get(
          `/api/reviews/astrologer/${person._id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data) setReviews(response.data);
      } catch (err) {
        setReviewError(err.message);
      } finally {
        setReviewLoading(false);
      }
    };

    const fetchAvgRating = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');

        const response = await Instance.get(
          `/api/reviews/astrologer/${person._id}/average-rating`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data) setAvgRating(response.data);
      } catch (err) {
        setAvgError(err.message);
      }
    };
    
    fetchAvgRating();
    fetchReviews();
    fetchFavorites();
  }, [navigation, person._id]);

  const onShare = async () => {
    try {
      await Share.share({
        message: `Check out ${person.name || 'this Astrologer'} on Astrowani!`,
      });
    } catch (error) {
      alert(error.message);
    }
  };

  const toggleFavorite = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Token not found');
      
      const response = await Instance.post(
        isFavorite ? '/api/favoriteAstrologer/remove' : 'api/favoriteAstrologer/add',
        { astrologerId: person._id },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );

      if (response.data) {
        setIsFavorite(!isFavorite);
      }
    } catch (error) {
      console.error('API call failed:', error.message);
    }
  };

  const languages = person.language?.join(', ') || 'Hindi, English';
  const specialties = person.specialties?.map(s => s.name).join(', ') || 'Vedic Astrology';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Background Header Arch */}
        <View style={styles.headerBackground} />

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <Image
              source={{ uri: person.profileImage || 'https://cdn-icons-png.flaticon.com/128/3135/3135715.png' }}
              style={styles.avatar}
            />
            <View style={styles.profileDetails}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName} numberOfLines={1}>{person.name || 'Astrologer'}</Text>
                <TouchableOpacity onPress={toggleFavorite} disabled={loading} style={styles.favBtn}>
                  {loading ? (
                    <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
                  ) : (
                    <FontAwesome name={isFavorite ? 'heart' : 'heart-o'} size={moderateScale(22)} color={isFavorite ? COLORS.AstroMaroon : '#ccc'} />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.specialization} numberOfLines={1}>{person.specialties?.[0]?.name || 'Vedic Astrology'}</Text>
              <Text style={styles.languages} numberOfLines={1}>{languages}</Text>
            </View>
          </View>

          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <MaterialIcons name="star" size={moderateScale(18)} color={COLORS.AstroGold} />
              <Text style={styles.statText}>{person.rating || avgRating?.averageRating || 'New'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <MaterialIcons name="work-outline" size={moderateScale(18)} color="#666" />
              <Text style={styles.statText}>{person.experience || '1'} Yrs</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.statItem} onPress={() => setModalVisible(true)}>
              <MaterialIcons name="card-giftcard" size={moderateScale(18)} color={COLORS.AstroMaroon} />
              <Text style={[styles.statText, { color: COLORS.AstroMaroon }]}>Gift</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.statItem} onPress={onShare}>
              <AntDesign name="sharealt" size={moderateScale(18)} color="#666" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Cards */}
        <View style={styles.infoSection}>
          
          {/* Specialization Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="stars" size={moderateScale(20)} color={COLORS.AstroMaroon} />
              <Text style={styles.sectionTitle}>Specialization</Text>
            </View>
            <View style={styles.tagsContainer}>
              {person.specialties?.length > 0 ? (
                person.specialties.map((item, index) => (
                  <View style={styles.tag} key={index}>
                    <Text style={styles.tagText}>{item.name}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.tag}><Text style={styles.tagText}>Vedic Astrology</Text></View>
              )}
            </View>
          </View>

          {/* About Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="info-outline" size={moderateScale(20)} color={COLORS.AstroMaroon} />
              <Text style={styles.sectionTitle}>About My Services</Text>
            </View>
            <Text numberOfLines={isExpanded ? undefined : 3} style={styles.bodyText}>
              {person.bio || 'Experienced and professional astrologer here to guide you through your life journey.'}
            </Text>
            <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)}>
              <Text style={styles.readMore}>{isExpanded ? 'Read Less' : 'Read More'}</Text>
            </TouchableOpacity>
          </View>

          {/* Experience Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="school" size={moderateScale(20)} color={COLORS.AstroMaroon} />
              <Text style={styles.sectionTitle}>Experience & Qualification</Text>
            </View>
            <Text style={styles.bodyText}>
              With several years of dedicated practice, I've honed my skills in {specialties}.
            </Text>
          </View>

          {/* Reviews Card */}
          <View style={[styles.card, { marginBottom: verticalScale(20) }]}>
            <View style={styles.reviewsHeader}>
              <View>
                <Text style={styles.sectionTitle}>Client Reviews</Text>
                <Text style={styles.reviewSubText}>{avgRating.totalReviews || '0'} reviews on Astrowani</Text>
              </View>
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingBadgeText}>{avgRating.averageRating || '0'}</Text>
                <MaterialIcons name="star" size={moderateScale(14)} color="#FFF" />
              </View>
            </View>

            {reviewloading ? (
              <ActivityIndicator size="small" color={COLORS.AstroMaroon} style={{ marginVertical: 20 }} />
            ) : reviewError ? (
              <Text style={{ color: 'red', textAlign: 'center' }}>{reviewError}</Text>
            ) : reviewsToShow.length > 0 ? (
              reviewsToShow.map((review, index) => (
                <View key={index} style={styles.reviewItem}>
                  <View style={styles.reviewItemHeader}>
                    <View style={styles.reviewerAvatar}>
                      <Text style={styles.reviewerInitial}>{review.user?.firstName?.charAt(0) || 'A'}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: scale(10) }}>
                      <Text style={styles.reviewerName}>{review.user?.firstName || 'Anonymous'}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <MaterialIcons key={i} name="star" size={moderateScale(12)} color={i < (review.rating || 5) ? COLORS.AstroGold : '#ddd'} />
                        ))}
                      </View>
                    </View>
                    <Text style={styles.reviewDate}>
                      {review.createdAt ? new Date(review.createdAt).toLocaleDateString('en-GB') : ''}
                    </Text>
                  </View>
                  <Text style={styles.reviewComment}>{review.comment || 'Great experience!'}</Text>
                  {index !== reviewsToShow.length - 1 && <View style={styles.reviewDivider} />}
                </View>
              ))
            ) : (
              <Text style={{ textAlign: 'center', color: '#888', marginVertical: 15 }}>No reviews yet.</Text>
            )}

            <View style={styles.reviewActionRow}>
              {!showAllReviews && reviews.length > 2 && (
                <TouchableOpacity onPress={handleShowAllReviews}>
                  <Text style={styles.actionTextBtn}>Show All</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => navigation.navigate('AddReview', { person })} style={styles.addReviewBtn}>
                <Text style={styles.addReviewTxt}>+ Write Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Action Dock */}
      <View style={styles.floatingDock}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('PersonToPersonChat', {person: person})}>
          <MaterialIcons name="chat" size={moderateScale(20)} color={COLORS.AstroMaroon} />
          <View style={styles.actionBtnTextCol}>
            <Text style={styles.actionBtnText}>Chat</Text>
            <Text style={styles.actionBtnPrice}>{person.pricing ? `₹${person.pricing}/min` : 'Free'}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionBtn, { marginLeft: scale(10) }]} 
          onPress={async () => {
            const token = await AsyncStorage.getItem('token');
            const userEntireData = JSON.parse(await AsyncStorage.getItem('userData'));
            navigation.navigate('EnxJoinScreen', {
              userId: person.userId, name: userEntireData?.name || 'User', astroId: person.userId,
              callType: 'voice', receiverId: person.userId, callingCondition: 'outgoing', callerRole: 'customer', userToken: token,
            });
          }}>
          <MaterialIcons name="call" size={moderateScale(20)} color={COLORS.AstroMaroon} />
          <View style={styles.actionBtnTextCol}>
            <Text style={styles.actionBtnText}>Call</Text>
            <Text style={styles.actionBtnPrice}>{person.videoPrice ? `₹${person.videoPrice}/min` : 'Free'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <GiftModal visible={isModalVisible} onClose={() => setModalVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.AstroSoftOrange },
  scrollContainer: { paddingBottom: verticalScale(100) },
  headerBackground: {
    backgroundColor: COLORS.AstroMaroon,
    height: verticalScale(120),
    borderBottomLeftRadius: moderateScale(40),
    borderBottomRightRadius: moderateScale(40),
    position: 'absolute',
    top: 0, left: 0, right: 0,
  },
  profileCard: {
    backgroundColor: '#fff',
    marginHorizontal: scale(15),
    marginTop: verticalScale(30),
    borderRadius: moderateScale(20),
    padding: scale(15),
    elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6,
  },
  profileTopRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: scale(80), height: scale(80),
    borderRadius: moderateScale(40),
    borderWidth: 3, borderColor: COLORS.AstroSoftOrange,
  },
  profileDetails: { flex: 1, marginLeft: scale(15) },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profileName: { fontSize: moderateScale(18), fontFamily: 'Lato-Bold', color: '#000', flex: 1 },
  favBtn: { padding: scale(5) },
  specialization: { fontSize: moderateScale(13), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', marginTop: verticalScale(2) },
  languages: { fontSize: moderateScale(12), color: '#666', fontFamily: 'Lato-Regular', marginTop: verticalScale(2) },
  statsBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: verticalScale(15), paddingTop: verticalScale(15),
    borderTopWidth: 1, borderTopColor: '#eee',
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: '#333' },
  statDivider: { width: 1, height: '100%', backgroundColor: '#eee' },
  infoSection: { paddingHorizontal: scale(15), marginTop: verticalScale(15) },
  card: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(15),
    padding: scale(15),
    marginBottom: verticalScale(15),
    borderWidth: 1.5, borderColor: COLORS.AstroMaroon,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(10), gap: 8 },
  sectionTitle: { fontSize: moderateScale(16), fontFamily: 'Lato-Bold', color: '#000' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: {
    backgroundColor: 'rgba(128,0,0,0.08)',
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(12), paddingVertical: verticalScale(6),
    marginRight: scale(8), marginBottom: verticalScale(8),
  },
  tagText: { fontSize: moderateScale(12), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold' },
  bodyText: { fontSize: moderateScale(13), color: '#444', fontFamily: 'Lato-Regular', lineHeight: 20 },
  readMore: { color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', marginTop: verticalScale(8), fontSize: moderateScale(12) },
  reviewsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(15) },
  reviewSubText: { fontSize: moderateScale(12), color: '#888', marginTop: verticalScale(2) },
  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.AstroGold,
    paddingHorizontal: scale(10), paddingVertical: verticalScale(5), borderRadius: moderateScale(12), gap: 4
  },
  ratingBadgeText: { color: '#FFF', fontFamily: 'Lato-Bold', fontSize: moderateScale(14) },
  reviewItem: { marginBottom: verticalScale(15) },
  reviewItemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(8) },
  reviewerAvatar: {
    width: scale(35), height: scale(35), borderRadius: scale(17.5),
    backgroundColor: 'rgba(128,0,0,0.1)', justifyContent: 'center', alignItems: 'center'
  },
  reviewerInitial: { color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', fontSize: moderateScale(16) },
  reviewerName: { fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: '#000' },
  reviewDate: { fontSize: moderateScale(11), color: '#999' },
  reviewComment: { fontSize: moderateScale(13), color: '#555', fontFamily: 'Lato-Regular', marginLeft: scale(45) },
  reviewDivider: { height: 1, backgroundColor: '#f0f0f0', marginTop: verticalScale(15), marginLeft: scale(45) },
  reviewActionRow: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(10) },
  actionTextBtn: { color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', fontSize: moderateScale(13) },
  addReviewBtn: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(16), paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
  },
  addReviewTxt: { color: '#FFF', fontFamily: 'Lato-Bold', fontSize: moderateScale(12) },
  floatingDock: {
    position: 'absolute', bottom: verticalScale(20), left: scale(15), right: scale(15),
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: moderateScale(30),
    padding: scale(8), elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 15,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', backgroundColor: COLORS.AstroGold, borderRadius: moderateScale(25),
    justifyContent: 'center', alignItems: 'center', paddingVertical: verticalScale(10),
  },
  actionBtnTextCol: { marginLeft: scale(8) },
  actionBtnText: { fontSize: moderateScale(15), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon },
  actionBtnPrice: { fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, opacity: 0.8 },
});

export default AstrologerInfo;
