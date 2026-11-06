// "You will miss consultation requests."
//
// WHY THIS IS PINNED AND NOT A POPUP. An astrologer whose notifications are off is
// not doing anything wrong and will never go looking for a settings page about it
// — they simply see fewer requests and assume demand is low. Measured on
// production 2026-11-07: six astrologers had chat, call or video switched on with
// no device that could receive a push at all. A dismissible popup would be
// dismissed once and the money would keep leaking; this stays until it is fixed,
// next to the ongoing-session bar, for the same reason that one is pinned.
//
// It renders NOTHING in the normal case, which is almost always.
//
// THE CHECK IS THE SERVER'S, NOT THIS PHONE'S. `syncNotificationDevice` returns
// whether ANY of this astrologer's devices can be reached, so somebody who has
// notifications off on a tablet but on the phone they actually work from is not
// nagged. A purely local check would warn them wrongly every time.

import React, {useCallback, useContext, useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Linking, AppState} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {LanguageContext} from '../context/LanguageContext';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import {probePermissionStatus, syncNotificationDevice} from '../utils/notificationDevice';

const PushDisabledBar = () => {
  const {t} = useContext(LanguageContext);
  const [state, setState] = useState(null); // {reachable, permission}

  const check = useCallback(async () => {
    try {
      const permission = await probePermissionStatus();
      // `force` so coming back from system settings gives an immediate answer
      // rather than being swallowed by the one-minute sync throttle — the moment
      // somebody has just fixed it is the moment they most need the bar to go.
      const res = await syncNotificationDevice({force: true});
      setState({
        permission,
        // An unreachable server must not produce a warning: `ok` false means we do
        // not know, and claiming "you will miss requests" on a failed request would
        // be alarming and wrong. Only a definite false counts.
        reachable: res?.ok ? res.reachable !== false : true,
      });
    } catch (_) {
      setState(null);
    }
  }, []);

  useEffect(() => {
    check();
    // Re-check on foreground, which is when somebody returns from the OS settings
    // screen this bar sends them to.
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  if (!state || state.reachable) return null;

  const blocked = state.permission === 'denied' || state.permission === 'blocked';

  return (
    <TouchableOpacity
      style={styles.bar}
      activeOpacity={0.85}
      onPress={() => {
        if (blocked) {
          Linking.openSettings().catch(() => {});
        } else {
          // Not a permission problem: the app has no usable push token. Re-syncing is
          // the only thing that can fix it from here, and it usually does.
          check();
        }
      }}>
      <Ionicons name="notifications-off-outline" size={20} color="#7F1D1D" />
      <View style={styles.text}>
        <Text style={styles.title}>{t('pushOff.title')}</Text>
        <Text style={styles.body}>
          {blocked ? t('pushOff.bodyBlocked') : t('pushOff.bodyNoToken')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#7F1D1D" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(10),
  },
  text: {flex: 1, marginHorizontal: scale(10)},
  title: {fontSize: moderateScale(13.5), fontWeight: '700', color: '#7F1D1D'},
  body: {fontSize: moderateScale(11.5), color: '#991B1B', marginTop: 2, lineHeight: moderateScale(16)},
});

export default PushDisabledBar;
