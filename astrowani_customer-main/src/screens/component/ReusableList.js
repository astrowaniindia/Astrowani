import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import StarRating from '../../components/StarRating';
import { LanguageContext } from '../../context/LanguageContext';
import { formatBusyLabel } from '../../utils/busyLabel';
import { requestNotifyMe } from '../../utils/notifyMe';

const ReusableList = ({data, actionButton, handleAstrologer, buttonType, refreshing, onRefresh}) => {
  const navigation = useNavigation();
  const { t } = React.useContext(LanguageContext);
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingAstroName, setWaitingAstroName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredData = React.useMemo(() => {
    if (!searchQuery || !data) return data;
    const query = searchQuery.toLowerCase();
    return data.filter(item => {
      const nameMatch = item.name?.toLowerCase().includes(query);
      const specMatch = item.specialties?.[0]?.name?.toLowerCase().includes(query) || item.specialty?.toLowerCase().includes(query);
      return nameMatch || specMatch;
    });
  }, [data, searchQuery]);

  // Show an "unavailable" message when a customer taps a service the astrologer
  // has turned off — the astrologer stays visible; only the button is disabled.
  const showUnavailable = (item, serviceKey) => {
    const key = serviceKey === 'video' ? 'alerts.notAvailableVideo'
      : serviceKey === 'call' ? 'alerts.notAvailableCall'
      : 'alerts.notAvailableChat';
    Alert.alert(t('alerts.unavailable'), t(key, { name: item.name || 'This astrologer' }));
  };

  // Master offline switch overrides every per-service button with one unified red "Offline" pill.
  const showOffline = (item) =>
    Alert.alert(t('alerts.unavailable'), t('alerts.astrologerOffline', { name: item.name || 'This astrologer' }));

  // Busy overrides every per-service button too (chat/call/video are mutually exclusive —
  // an astrologer already occupied with one customer can't take a second request of any kind).
  const handleNotifyMeTap = async (item) => {
    const requestType = buttonType === 'video' ? 'video' : buttonType === 'call' ? 'audio' : 'chat';
    const { ok } = await requestNotifyMe(item.userId || item._id, requestType);
    Alert.alert(
      ok ? "We'll let you know" : t('common.error'),
      ok ? `We'll notify you when ${item.name || 'this astrologer'} is free.` : 'Could not join the waitlist. Please try again.'
    );
  };

  const renderButton = (item) => {
    if (item.isOnline === false && buttonType !== 'view profile') {
      return (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.actionBtnUnavailableChat, styles.smallButton]}
            activeOpacity={0.8}
            onPress={() => showOffline(item)}
          >
            <MaterialIcons name="wifi-off" size={moderateScale(16)} color="#fff" style={{marginRight: 2}} />
            <Text style={styles.chatText}>{t('common.offline')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (item.isBusy === true && buttonType !== 'view profile') {
      const elapsed = item.busySince
        ? Math.max(0, Math.floor((Date.now() - new Date(item.busySince).getTime()) / 1000))
        : 0;
      return (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.actionBtnBusyChat, styles.smallButton]}
            activeOpacity={0.8}
            onPress={() => handleNotifyMeTap(item)}
          >
            <MaterialIcons name="schedule" size={moderateScale(16)} color="#fff" style={{marginRight: 2}} />
            <Text style={styles.chatText}>{formatBusyLabel(elapsed)}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    switch (buttonType) {
      case 'video': {
        // Same pill style as the Chat button (maroon, small) for a consistent look.
        const enabled = item.isVideoEnabled;
        return (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[enabled ? styles.actionBtnChat : styles.actionBtnUnavailableChat, styles.smallButton]}
              activeOpacity={0.8}
              onPress={() => (enabled ? actionButton(item) : showUnavailable(item, 'video'))}
            >
              <MaterialIcons name={enabled ? 'videocam' : 'videocam-off'} size={moderateScale(16)} color="#fff" style={{marginRight: 2}} />
              <Text style={styles.chatText}>{enabled ? t('common.video') : t('alerts.unavailable')}</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'call': {
        // Same pill style as the Chat button; uses the parent-provided handler.
        const enabled = item.isCallEnabled;
        return (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[enabled ? styles.actionBtnChat : styles.actionBtnUnavailableChat, styles.smallButton]}
              activeOpacity={0.8}
              onPress={() => (enabled ? actionButton(item) : showUnavailable(item, 'call'))}
            >
              <MaterialIcons name={enabled ? 'call' : 'phone-disabled'} size={moderateScale(16)} color="#fff" style={{marginRight: 2}} />
              <Text style={styles.chatText}>{enabled ? t('common.call') : t('alerts.unavailable')}</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'view profile':
        return (
          <TouchableOpacity
            style={styles.actionBtnProfile}
            onPress={() => actionButton(item)}
          >
            <Text style={styles.actionBtnProfileText}>{t('common.viewProfile')}</Text>
          </TouchableOpacity>
        );
      case 'chat':
      default: {
        const enabled = item.isChatEnabled;
        return (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[enabled ? styles.actionBtnChat : styles.actionBtnUnavailableChat, styles.smallButton]}
              activeOpacity={0.8}
              onPress={() => (enabled ? actionButton(item) : showUnavailable(item, 'chat'))}
            >
              <MaterialIcons name={enabled ? 'chat' : 'speaker-notes-off'} size={moderateScale(16)} color="#fff" style={{marginRight: 2}} />
              <Text style={styles.chatText}>{enabled ? t('common.chat') : t('alerts.unavailable')}</Text>
            </TouchableOpacity>
          </View>
        );
      }
    }
  };

  const renderItem = ({item}) => {
    const languages = item.language?.join(', ');

    return (
      <TouchableOpacity
        onPress={() => handleAstrologer && handleAstrologer(item)}
        style={styles.card}
        activeOpacity={0.9}
      >
        {item.badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        )}
        <View style={styles.row}>
          <View style={styles.reviewImageView}>
            <Image
              source={{
                uri: item.profileImage || 'https://th.bing.com/th/id/OIP.xHU435DrZMf0aN-ri48zEAHaJQ?w=126&h=180&c=7&r=0&o=5&pid=1.7',
              }}
              style={styles.avatar}
            />

            <StarRating
              rating={item?.rating}
              size={13}
              style={styles.starsContainer}
            />
          </View>
          <View style={styles.details}>
            <Text style={styles.name} numberOfLines={1}>{item.name || 'Astrologer'}</Text>

            <Text style={styles.specialization} numberOfLines={1}>
              {item.specialties?.[0]?.name || 'Vedic Astrology'}
            </Text>

            <Text style={styles.languages} numberOfLines={1}>
              <MaterialIcons name="language" size={moderateScale(12)} color={COLORS.AstroMaroon} /> {languages || 'Hindi'}
            </Text>

            <Text style={styles.experience}>
              <MaterialIcons name="work-outline" size={moderateScale(12)} color={COLORS.AstroMaroon} /> {t('common.exp')}: {item.experience ?? '0'} {t('common.yrs')}
            </Text>

            <View style={styles.priceRow}>
              <Text style={styles.offer}>
                {item.pricing ? `₹${item.pricing}/min` : t('common.free')}
              </Text>
            </View>
          </View>

          {renderButton(item)}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.AstroSoftOrange }}>
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={moderateScale(24)} color={COLORS.AstroMaroon} />
        <TextInput
           style={styles.searchInput}
           placeholder={t('common.searchAstrologer')}
           value={searchQuery}
           onChangeText={setSearchQuery}
           placeholderTextColor={COLORS.AshGray}
        />
      </View>
      <FlatList
        data={filteredData}
        keyExtractor={item => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.container}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
      {/* Waiting Modal */}
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
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.AstroGold, marginTop: 20, marginBottom: 10 }}>{t('home.requestSent')}</Text>
            <Text style={{ fontSize: 16, color: COLORS.AstroSoftOrange, textAlign: 'center', marginBottom: 25, lineHeight: 22 }}>
              {t('home.waitingFor', { name: waitingAstroName })}
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
              <Text style={{ color: COLORS.AstroMaroon, fontWeight: 'bold', fontSize: 16 }}>{t('home.cancelRequest')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ReusableList;

const styles = StyleSheet.create({
  container: {
    padding: scale(15),
    paddingBottom: verticalScale(85),
    backgroundColor: COLORS.AstroSoftOrange,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: scale(15),
    marginBottom: scale(5),
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
    backgroundColor: '#fff',
    borderRadius: moderateScale(16),
    padding: scale(15),
    marginBottom: verticalScale(15),
    elevation: 5,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(244, 216, 188, 0.5)',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: COLORS.AstroGold,
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(5),
    borderTopRightRadius: moderateScale(15),
    borderBottomLeftRadius: moderateScale(15),
    zIndex: 1,
  },
  badgeText: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(11),
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: scale(70),
    height: scale(70),
    borderRadius: scale(35),
    borderWidth: 2,
    borderColor: COLORS.AstroGold,
  },
  details: {
    flex: 1,
    marginLeft: scale(5),
    justifyContent: 'center',
  },
  name: {
    fontSize: moderateScale(18),
    color: COLORS.AstroMaroon,
    marginBottom: verticalScale(2),
    fontFamily: 'Lato-Bold',
    fontWeight: '700',
  },
  specialization: {
    fontSize: moderateScale(13),
    marginBottom: verticalScale(4),
    color: COLORS.ARSENIC,
    fontFamily: 'Lato-Regular',
  },
  languages: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
    color: '#666',
    marginBottom: verticalScale(3),
  },
  experience: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
    color: '#666',
    marginBottom: verticalScale(6),
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offer: {
    fontSize: moderateScale(14),
    color: COLORS.green,
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButton: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
    marginVertical: verticalScale(4),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    backgroundColor: COLORS.green,
    borderRadius: moderateScale(25),
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  actionBtnText: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14),
    fontWeight: 'bold',
  },
  actionBtnChat: {
    backgroundColor: COLORS.AstroMaroon,
    elevation: 3,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  // Red "unavailable" states — astrologer stays visible, button signals the service is off
  actionBtnUnavailable: {
    backgroundColor: '#C0392B',
    borderRadius: moderateScale(25),
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  actionBtnUnavailableChat: {
    backgroundColor: '#C0392B',
    opacity: 0.85,
  },
  actionBtnBusyChat: {
    backgroundColor: '#E67E22',
  },
  actionBtnProfile: {
    borderColor: COLORS.AstroMaroon,
    borderWidth: 1.5,
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
  },
  actionBtnProfileText: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
  },
  chatText: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(13),
    fontWeight: 'bold',
  },
  reviewImageView: {
    alignItems: 'center',
    width: scale(85),
    marginRight: scale(5),
  },
  rating: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(11),
  },
  starsContainer: {
    flexDirection: 'row',
    marginTop: verticalScale(4),
  },
  star: {
    marginRight: scale(1),
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(10),
    padding: moderateScale(20),
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    color: '#333',
    marginTop: verticalScale(15),
    marginBottom: verticalScale(10),
  },
  modalText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#666',
    textAlign: 'center',
    marginBottom: verticalScale(20),
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
  },
  cancelButtonText: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14),
  },
});


