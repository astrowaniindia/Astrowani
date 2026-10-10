// Full-screen "want a free call?" prompt shown BEFORE Login/signup, only to a
// signed-out visitor whose install came from the "11 min call better geolocations"
// Google Ads campaign (utils/acquisition.js, isTargetCampaignFirstOpen — see App.js
// for how this screen gets chosen as the initial route).
//
// That campaign's cost per install (~₹41) is roughly 20x the broad campaign's (~₹1.91,
// see astrowani-backend's acquisitionRoutes.js), so an install from it is worth
// fighting harder to turn into a customer than the quiet post-signup gift screen every
// other install already gets.
//
// Tapping "Yes" queues the free-call sheet (utils/freeCallInvite.js) so it opens the
// moment Home mounts, same mechanism as a tapped free-call-invite push. The cross just
// moves on to Login — nothing here can trap anyone.
import React, { useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';
import { markCampaignFreeCallPromptShown } from '../../utils/acquisition';
import { queueFreeCallFromCampaign, queueCampaignDeclined } from '../../utils/freeCallInvite';

const GUIDE_AVATAR_ASPECT = 145 / 281;
const GOLD = COLORS.AstroGold;
const CREAM = '#FFF8EE';

export default function CampaignFreeCallPrompt({ navigation }) {
  const { t } = useContext(LanguageContext);
  const insets = useSafeAreaInsets();
  const leftRef = useRef(false);
  const bounce = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    captureEvent('campaign_free_call_prompt_shown');
    // Marked the moment it's actually on screen, not before — so an interrupted
    // bootstrap (killed mid-launch) just tries again next time rather than skipping it.
    markCampaignFreeCallPromptShown();

    Animated.timing(enter, {
      toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -8, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    float.start();
    return () => float.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goLogin = (via) => {
    if (leftRef.current) return;
    leftRef.current = true;
    captureEvent('campaign_free_call_prompt_closed', { via });
    // Asked once already on this screen — SignupWelcome must not ask again with its
    // own offer card right after a decline.
    queueCampaignDeclined();
    navigation.replace('Login');
  };

  const acceptFreeCall = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    captureEvent('campaign_free_call_prompt_accepted');
    queueFreeCallFromCampaign();
    navigation.replace('Login');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <TouchableOpacity
        style={[styles.closeBtn, { top: insets.top + verticalScale(10) }]}
        activeOpacity={0.7}
        onPress={() => goLogin('cross')}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Icon name="close" size={moderateScale(22)} color={CREAM} />
      </TouchableOpacity>

      {/* Same brand mark as Login/SignupWelcome, so this screen reads as part of the
          app rather than a bare interstitial. Pushes the bubble+avatar below it,
          lower on the screen than before. */}
      <Animated.View style={[styles.brandRow, { opacity: enter }]}>
        <Image
          source={require('../../assets/images/brandStarLogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brand}>Astrowani</Text>
      </Animated.View>

      <View style={styles.middle}>
        <Animated.View style={[styles.bubble, { opacity: enter }]}>
          <Text style={styles.bubbleMessage}>{t('campaignFreeCall.message')}</Text>
          <View style={styles.bubbleTailWrap} pointerEvents="none">
            <View style={styles.bubbleTailBorder} />
            <View style={styles.bubbleTail} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.stage, { opacity: enter }]}>
          <Animated.Image
            source={require('../../assets/images/guideAvatarLogin.png')}
            style={[styles.avatar, { transform: [{ translateY: bounce }] }]}
            resizeMode="contain"
          />
          <View style={styles.shadow} />
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + verticalScale(18) }]}>
        <TouchableOpacity style={styles.yesBtn} activeOpacity={0.85} onPress={acceptFreeCall}>
          <Text style={styles.yesBtnText}>{t('campaignFreeCall.yesButton')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.AstroMaroon },
  closeBtn: {
    position: 'absolute',
    right: scale(16),
    zIndex: 10,
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(28),
  },
  logo: { width: scale(44), height: scale(44), marginRight: scale(10) },
  brand: { color: GOLD, fontSize: moderateScale(22), fontWeight: '800', letterSpacing: 0.5 },
  middle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(24),
  },
  bubble: {
    backgroundColor: CREAM,
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(16),
    paddingHorizontal: scale(20),
    maxWidth: scale(340),
    borderWidth: 1.5,
    borderColor: GOLD,
    marginBottom: verticalScale(28),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 2,
  },
  bubbleMessage: {
    fontSize: moderateScale(16),
    fontWeight: '700',
    color: COLORS.AstroMaroon,
    textAlign: 'center',
    lineHeight: moderateScale(23),
  },
  bubbleTailWrap: {
    position: 'absolute',
    bottom: -verticalScale(12),
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bubbleTailBorder: {
    width: 0,
    height: 0,
    borderLeftWidth: scale(11),
    borderRightWidth: scale(11),
    borderTopWidth: verticalScale(12),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: GOLD,
  },
  bubbleTail: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: scale(9),
    borderRightWidth: scale(9),
    borderTopWidth: verticalScale(10),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: CREAM,
  },
  stage: { alignItems: 'center', justifyContent: 'flex-end' },
  avatar: { height: verticalScale(230), aspectRatio: GUIDE_AVATAR_ASPECT },
  shadow: {
    width: scale(80),
    height: verticalScale(7),
    borderRadius: scale(40),
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginTop: -verticalScale(5),
  },
  footer: { paddingHorizontal: scale(24), alignItems: 'stretch' },
  yesBtn: {
    backgroundColor: GOLD,
    borderRadius: moderateScale(28),
    paddingVertical: verticalScale(15),
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  yesBtnText: { color: COLORS.AstroMaroon, fontSize: moderateScale(17), fontWeight: '800' },
});
