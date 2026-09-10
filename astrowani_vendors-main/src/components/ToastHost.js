// Cross-platform toast.
//
// WHY THIS EXISTS: every short confirmation in this app ("You're now Online",
// "Caller cancelled the request", "Profile updated") went through ToastAndroid,
// which is a silent no-op on iOS — so on an iPhone none of them ever appeared.
// iOS has no system toast, so this draws its own.
//
// Android keeps the native ToastAndroid on purpose: it survives the app going to
// the background and is what astrologers already see, so nothing changes there.
//
//   import showToast from '../utils/showToast';
//   showToast('Saved');                  // short
//   showToast('Longer message', { long: true });
//
// Mount <ToastHost /> ONCE, at the navigation root, so a toast raised just before
// a navigation (EditProfile saves, then goes back) survives the screen change.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, ToastAndroid } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SHORT_MS = 2200;
const LONG_MS = 3800;

let listener = null;

export function showToast(message, { long = false } = {}) {
  if (!message) return;
  if (Platform.OS === 'android') {
    ToastAndroid.show(String(message), long ? ToastAndroid.LONG : ToastAndroid.SHORT);
    return;
  }
  // Deferred one tick: some callers raise a toast from INSIDE a state updater
  // (HomeScreen dismisses a cancelled request within setPopupQueue). Setting this
  // host's state synchronously from there is React's "cannot update a component
  // while rendering a different component" error.
  setTimeout(() => { if (listener) listener({ message: String(message), long }); }, 0);
}

export function ToastHost() {
  const [toast, setToast] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    listener = (next) => {
      // A newer toast replaces the current one rather than queueing behind it —
      // a stale "Online" should never linger after the astrologer went "Offline".
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast(next);
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true })
          .start(() => setToast(null));
      }, next.long ? LONG_MS : SHORT_MS);
    };
    return () => {
      listener = null;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [opacity]);

  if (!toast || Platform.OS === 'android') return null;

  return (
    // pointerEvents="none": a toast must never swallow a tap meant for the screen
    // under it — it is information, not a control.
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { bottom: insets.bottom + 72, opacity }]}>
      <Text style={styles.text} numberOfLines={3}>{toast.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 10000,
    elevation: 10000,
  },
  text: {
    backgroundColor: 'rgba(40,24,18,0.94)',
    color: '#fff',
    fontSize: 14,
    lineHeight: 19,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    overflow: 'hidden',
    textAlign: 'center',
  },
});

export default ToastHost;
