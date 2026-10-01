import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  AppState,
  Platform,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { checkOverlayPermission, requestOverlayPermission, isOverlaySupported } from '../utils/ringingForegroundService';
import { scale, verticalScale, moderateScale } from '../utils/Scaling';

/**
 * OverlayPermissionModal
 *
 * Checks if the astrologer has granted "Display over other apps" (SYSTEM_ALERT_WINDOW).
 * If NOT granted, shows an in-app prompt on app open explaining why it's necessary
 * (to ensure persistent incoming call banners appear over other apps).
 *
 * When the user taps "Allow Permission", redirects directly to the system Settings page.
 * When the user returns to the app, AppState active listener auto-checks the permission
 * and dismisses the popup if granted.
 */
export default function OverlayPermissionModal({ visibleOverride, onPermissionGranted }) {
  const [visible, setVisible] = useState(false);
  const [dismissedSession, setDismissedSession] = useState(false);
  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;

  const verifyPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    // An older store build has no overlay, so there is nothing to grant.
    if (!isOverlaySupported) return;
    try {
      const granted = await checkOverlayPermission();
      if (granted) {
        setVisible(false);
        if (onPermissionGranted) onPermissionGranted();
      } else if (!dismissedSession) {
        setVisible(true);
      }
    } catch (e) {
      console.log('Error checking overlay permission:', e);
    }
  }, [dismissedSession, onPermissionGranted]);

  useEffect(() => {
    verifyPermission();
  }, [verifyPermission]);

  // Re-check when returning from Android Settings screen
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        verifyPermission();
      }
    });
    return () => subscription.remove();
  }, [verifyPermission]);

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.9);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, scaleAnim]);

  const handleAllow = async () => {
    try {
      await requestOverlayPermission();
    } catch (e) {
      console.log('Error requesting overlay permission:', e);
    }
  };

  const handleDismiss = () => {
    setDismissedSession(true);
    setVisible(false);
  };

  if (!visible && !visibleOverride) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          {/* Top Icon Badge */}
          <View style={styles.iconCircle}>
            <MaterialIcons name="phone-in-talk" size={moderateScale(32)} color={COLORS.AstroGold} />
          </View>

          {/* Title & Description */}
          <Text style={styles.title}>Enable Call Alerts</Text>
          <Text style={styles.subtitle}>
            To receive incoming consultation calls and chat requests while using other apps or when your screen is locked, please allow <Text style={styles.boldText}>"Display over other apps"</Text>.
          </Text>

          {/* Feature Highlight List */}
          <View style={styles.featureBox}>
            <View style={styles.featureRow}>
              <MaterialIcons name="check-circle" size={moderateScale(18)} color="#27AE60" style={styles.featureIcon} />
              <Text style={styles.featureText}>Persistent banner on incoming calls</Text>
            </View>
            <View style={styles.featureRow}>
              <MaterialIcons name="check-circle" size={moderateScale(18)} color="#27AE60" style={styles.featureIcon} />
              <Text style={styles.featureText}>Instant 1-tap Accept / Reject buttons</Text>
            </View>
            <View style={styles.featureRow}>
              <MaterialIcons name="check-circle" size={moderateScale(18)} color="#27AE60" style={styles.featureIcon} />
              <Text style={styles.featureText}>Never miss a paid client consultation</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.primaryButton}
            onPress={handleAllow}
          >
            <Text style={styles.primaryButtonText}>Allow in Settings</Text>
            <MaterialIcons name="arrow-forward" size={moderateScale(18)} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.secondaryButton}
            onPress={handleDismiss}
          >
            <Text style={styles.secondaryButtonText}>Not Now</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(20),
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1E1028',
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(22),
    paddingTop: verticalScale(28),
    paddingBottom: verticalScale(20),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  iconCircle: {
    width: moderateScale(64),
    height: moderateScale(64),
    borderRadius: moderateScale(32),
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(16),
    borderWidth: 1.5,
    borderColor: 'rgba(255, 215, 0, 0.35)',
  },
  title: {
    fontSize: moderateScale(19),
    fontWeight: '700',
    color: COLORS.AstroGold,
    textAlign: 'center',
    marginBottom: verticalScale(10),
  },
  subtitle: {
    fontSize: moderateScale(13.5),
    color: '#E0E0E0',
    textAlign: 'center',
    lineHeight: moderateScale(19),
    marginBottom: verticalScale(18),
  },
  boldText: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  featureBox: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(14),
    marginBottom: verticalScale(20),
    borderLeftWidth: 3,
    borderLeftColor: COLORS.AstroGold,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(4),
  },
  featureIcon: {
    marginRight: scale(8),
  },
  featureText: {
    fontSize: moderateScale(12.5),
    color: '#D4D4D4',
    flex: 1,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(14),
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.AstroGold,
    marginBottom: verticalScale(10),
  },
  primaryButtonText: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    color: '#FFFFFF',
    marginRight: scale(6),
  },
  secondaryButton: {
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(16),
  },
  secondaryButtonText: {
    fontSize: moderateScale(13),
    color: '#A0A0A0',
    fontWeight: '500',
  },
});
