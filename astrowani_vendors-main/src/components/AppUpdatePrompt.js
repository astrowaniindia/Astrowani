// astrowani_vendors-main/src/components/AppUpdatePrompt.js
//
// Vendor-side "a new version is available" prompt. Same contract as the customer
// app's version — mount <AppUpdatePromptHost /> ONCE near the navigation root, and
// raise it out of band with:
//
//   import { showAppUpdatePrompt } from '../components/AppUpdatePrompt';
//   showAppUpdatePrompt();                     // re-checks with the server first
//   showAppUpdatePrompt({ title, message });   // admin-pushed copy
//
// Soft vs forced is decided by the SERVER (see appPromptRoutes.js), never inferred
// here — a client-side bug must not be able to invent an unescapable wall in front
// of the app an astrologer earns from.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing, BackHandler,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';
import {
  fetchUpdateStatus, isUpdateSnoozed, snoozeUpdate, openStore, localizedCopy,
  setUpdatePromptActive,
} from '../utils/appPrompts';

const FALLBACK_TITLE = 'A new version is available';
const FALLBACK_MESSAGE = 'Update the app to keep receiving calls and chats reliably.';

let listener = null;

export const showAppUpdatePrompt = (override) => {
  if (listener) listener(override || null);
};

export function AppUpdatePromptHost() {
  const { language } = useContext(LanguageContext);
  const [visible, setVisible] = useState(false);
  const [info, setInfo] = useState(null);
  const [override, setOverride] = useState(null);
  const [opening, setOpening] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  const present = useCallback(async (customCopy) => {
    const status = await fetchUpdateStatus();
    if (!status) return;
    setInfo(status);
    setOverride(customCopy);
    setVisible(true);
    captureEvent('app_update_prompt_shown', {
      force: !!status.force,
      latest_version: status.latestVersion || 'unknown',
      trigger: customCopy ? 'admin' : 'launch',
    });
  }, []);

  useEffect(() => {
    listener = present;
    return () => { listener = null; };
  }, [present]);

  // Launch check. A snoozed SOFT prompt stays quiet; a FORCED one ignores the snooze,
  // because "Later" was never offered for it in the first place.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await fetchUpdateStatus();
      if (cancelled || !status) return;
      if (!status.force && (await isUpdateSnoozed())) return;
      if (cancelled) return;
      setInfo(status);
      setVisible(true);
      captureEvent('app_update_prompt_shown', {
        force: !!status.force,
        latest_version: status.latestVersion || 'unknown',
        trigger: 'launch',
      });
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setUpdatePromptActive(visible);
    return () => setUpdatePromptActive(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    scaleAnim.setValue(0.92);
    Animated.timing(scaleAnim, {
      toValue: 1, duration: 180, easing: Easing.out(Easing.ease), useNativeDriver: true,
    }).start();
  }, [visible, scaleAnim]);

  const forced = !!info?.force;

  // Android hardware back must not escape a forced prompt. This works only in
  // combination with the overlay in render() below — see the comment there.
  useEffect(() => {
    if (!visible || !forced) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [visible, forced]);

  const later = async () => {
    if (forced) return;
    captureEvent('app_update_prompt_dismissed', { latest_version: info?.latestVersion || 'unknown' });
    setVisible(false);
    await snoozeUpdate(info?.remindAfterHours);
  };

  const update = async () => {
    setOpening(true);
    const ok = await openStore(info?.storeUrl);
    setOpening(false);
    captureEvent('app_update_prompt_accepted', {
      latest_version: info?.latestVersion || 'unknown',
      opened: ok,
      force: forced,
    });
    // A forced prompt stays up — closing it would drop them into an app we have just
    // declared unusable.
    if (ok && !forced) setVisible(false);
  };

  if (!visible || !info) return null;

  const copy = localizedCopy(override || info, language, FALLBACK_TITLE, FALLBACK_MESSAGE);

  const body = (
    <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="system-update" size={moderateScale(30)} color="#fff" />
          </View>

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.message}</Text>

          {!!info.latestVersion && (
            <Text style={styles.version}>{`Version ${info.latestVersion}`}</Text>
          )}

          {forced && (
            <View style={styles.forcedRow}>
              <MaterialIcons name="info-outline" size={moderateScale(15)} color={COLORS.AstroMaroon} />
              <Text style={styles.forcedText}>This update is required to keep using the app.</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.button}
            activeOpacity={0.85}
            onPress={update}
            disabled={opening}
          >
            <MaterialIcons
              name="get-app"
              size={moderateScale(18)}
              color="#fff"
              style={{ marginRight: scale(8) }}
            />
            <Text style={styles.buttonText}>{opening ? 'Opening Play Store…' : 'Update now'}</Text>
          </TouchableOpacity>

          {!forced && (
            <TouchableOpacity onPress={later} style={styles.skipBtn}>
              <Text style={styles.skipText}>Later</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
    </View>
  );

  // A FORCED prompt is deliberately NOT a <Modal>.
  //
  // MEASURED ON A DEVICE (RN 0.77, Android 16): a modal cannot be made back-proof.
  // ReactModalHostView creates its Dialog with FLAG_NOT_FOCUSABLE, so the back key
  // never reaches the dialog's key listener — `onRequestClose` does NOT fire, and
  // neither does a BackHandler subscription — yet the dialog is torn down natively
  // anyway, leaving JS still believing it is visible. The result was a "required"
  // update that one back press dismissed for good.
  //
  // So a forced prompt renders as a plain absolutely-positioned overlay in the
  // normal view tree. Nothing native can dismiss a View, so the prompt survives a
  // back press (which just backgrounds the app) and is still there on resume.
  //
  // A SOFT prompt stays a Modal: it is meant to be dismissible.
  if (forced) {
    return <View style={styles.forcedOverlayRoot}>{body}</View>;
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={later}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Fills the root view and paints above the whole app. `elevation` matters on
  // Android: without it a later sibling can still draw underneath.
  forcedOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(30),
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(24),
    paddingHorizontal: scale(22),
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  iconCircle: {
    width: moderateScale(58),
    height: moderateScale(58),
    borderRadius: moderateScale(29),
    backgroundColor: COLORS.AstroMaroon,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  title: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: verticalScale(6),
  },
  subtitle: {
    fontSize: moderateScale(13),
    color: '#555',
    textAlign: 'center',
    lineHeight: moderateScale(19),
    marginBottom: verticalScale(10),
  },
  version: {
    fontSize: moderateScale(11.5),
    color: '#888',
    marginBottom: verticalScale(10),
  },
  forcedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fdf3ef',
    borderRadius: moderateScale(8),
    paddingVertical: verticalScale(7),
    paddingHorizontal: scale(10),
    marginBottom: verticalScale(12),
  },
  forcedText: {
    flex: 1,
    marginLeft: scale(6),
    fontSize: moderateScale(11.5),
    color: COLORS.AstroMaroon,
    lineHeight: moderateScale(16),
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(24),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(28),
    alignSelf: 'stretch',
  },
  buttonText: {
    color: '#fff',
    fontSize: moderateScale(14.5),
    fontWeight: '700',
  },
  skipBtn: {
    marginTop: verticalScale(12),
    paddingVertical: verticalScale(4),
  },
  skipText: {
    color: '#888',
    fontSize: moderateScale(13),
  },
});

export default AppUpdatePromptHost;
