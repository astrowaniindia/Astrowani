import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {scale, verticalScale, moderateScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import {showReviewPrompt} from '../../components/ReviewPrompt';
import {LanguageContext} from '../../context/LanguageContext';

// Keyed by the stable English typeKey (not the translated display label in session.chatType).
const TYPE_COLORS = {
  chat:  '#5C6BC0',
  audio: '#2E7D32',
  video: '#6A1B9A',
  live:  '#C62828',
};

const SessionDetails = ({session, handleprofile}) => {
  const {t} = React.useContext(LanguageContext);
  const typeColor = TYPE_COLORS[session.typeKey] || COLORS.AstroMaroon;

  const onRate = () => {
    const astrologerId = session.astro?._id || session.astro?.userId;
    if (!astrologerId) return;
    showReviewPrompt({ astrologerId, name: session.name, image: session.image });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.referenceText}>{t('session.ref', {id: session.referenceId})}</Text>
        <View style={[styles.typePill, {backgroundColor: typeColor + '18', borderColor: typeColor + '44'}]}>
          <Text style={[styles.typeText, {color: typeColor}]}>{session.chatType}</Text>
        </View>
        {session.isActive && (
          <View style={styles.activePill}>
            <Text style={styles.activeText}>{t('session.active')}</Text>
          </View>
        )}
      </View>

      {/* Body */}
      <View style={styles.details}>
        <View style={styles.imgView}>
          <Image source={{uri: session.image}} style={styles.image} />
          <TouchableOpacity
            onPress={() => handleprofile(session)}
            style={styles.profileButton}>
            <Text style={styles.profileButtonText}>{t('session.viewProfile')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.info}>
          <Text style={styles.name}>{session.name}</Text>
          <Text style={styles.time}>{session.time}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('session.rate')}</Text>
              <Text style={styles.statValue}>₹{session.rate}/min</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('session.duration')}</Text>
              <Text style={styles.statValue}>{session.isActive ? t('session.active') : `${session.duration} min`}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('session.charged')}</Text>
              <Text style={[styles.statValue, styles.chargedValue]}>{session.isActive ? '—' : `₹${session.deduction}`}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Rate button — opens the shared review prompt (real submission + eligibility). */}
      <TouchableOpacity
        style={styles.ratingBtn}
        onPress={onRate}
        activeOpacity={0.8}>
        <FontAwesome name="star" size={14} color="#FFD700" />
        <Text style={styles.ratingBtnText}>{t('session.rateThisSession')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.AstroSoftOrange,
    borderRadius: moderateScale(12),
    marginVertical: verticalScale(8),
    marginHorizontal: scale(15),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },

  // ── Header ───────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    gap: scale(8),
    flexWrap: 'wrap',
  },
  referenceText: {
    fontSize: moderateScale(11),
    color: '#555',
    fontWeight: '600',
    flex: 1,
  },
  typePill: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(10),
    borderWidth: 1,
  },
  typeText: {fontSize: moderateScale(11), fontWeight: '700'},
  activePill: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(10),
  },
  activeText: {fontSize: moderateScale(11), fontWeight: '700', color: '#2E7D32'},

  // ── Body ─────────────────────────────────────────────────────────────────────
  details: {
    flexDirection: 'row',
    padding: scale(12),
    gap: scale(12),
  },
  imgView: {alignItems: 'center'},
  image: {
    width: scale(58),
    height: scale(58),
    borderRadius: scale(29),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  profileButton: {
    marginTop: verticalScale(8),
    backgroundColor: '#e6f2e6',
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(3),
    paddingHorizontal: scale(8),
  },
  profileButtonText: {color: '#2E7D32', fontSize: moderateScale(10), fontWeight: '700'},

  info: {flex: 1, justifyContent: 'center'},
  name: {fontSize: moderateScale(16), fontWeight: '700', color: '#111', marginBottom: verticalScale(2)},
  time: {fontSize: moderateScale(11), color: '#666', marginBottom: verticalScale(10)},

  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: moderateScale(8),
    paddingVertical: verticalScale(6),
  },
  statItem: {flex: 1, alignItems: 'center', gap: verticalScale(2)},
  statDivider: {width: 1, backgroundColor: 'rgba(0,0,0,0.1)', marginVertical: verticalScale(2)},
  statLabel: {fontSize: moderateScale(10), color: '#888', fontWeight: '500'},
  statValue: {fontSize: moderateScale(13), fontWeight: '700', color: '#222'},
  chargedValue: {color: COLORS.AstroMaroon},

  // ── Rate button ──────────────────────────────────────────────────────────────
  ratingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(10),
    gap: scale(6),
  },
  ratingBtnText: {color: '#fff', fontWeight: '700', fontSize: moderateScale(13)},

  // ── Modal ────────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(16),
    padding: scale(24),
    alignItems: 'center',
  },
  closeButton: {position: 'absolute', top: scale(12), right: scale(12)},
  modalImage: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(36),
    marginBottom: verticalScale(10),
    borderWidth: 2,
    borderColor: COLORS.AstroSoftOrange,
  },
  modalName: {fontSize: moderateScale(17), fontWeight: '700', color: '#111', marginBottom: verticalScale(4)},
  modalSubtitle: {fontSize: moderateScale(15), fontWeight: '600', color: '#333', marginBottom: verticalScale(6)},
  modalDesc: {
    fontSize: moderateScale(12),
    color: '#888',
    textAlign: 'center',
    marginBottom: verticalScale(16),
    lineHeight: moderateScale(18),
  },
  starsRow: {flexDirection: 'row', gap: scale(8), marginBottom: verticalScale(20)},
  starBtn: {padding: scale(2)},
  submitBtn: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(11),
    paddingHorizontal: scale(40),
    borderRadius: moderateScale(25),
  },
  submitBtnText: {color: '#fff', fontSize: moderateScale(14), fontWeight: '700'},
});

export default SessionDetails;
