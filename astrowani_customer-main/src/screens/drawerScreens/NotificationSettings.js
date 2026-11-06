// The preference centre.
//
// WHY IT EXISTS. Until now a customer who wanted order updates but not offers had
// exactly one lever: switch notifications off for the whole app. The published
// research says 46% of people do that after 2–5 promos a week — and when they do,
// the transactional notifications go with it, so they stop being told their order
// shipped or that an astrologer answered. One blunt switch costs us the messages
// that matter in order to stop the ones that do not.
//
// So the categories here are the two that can be turned off, and the one that
// cannot is named explicitly rather than hidden: consultations, orders and support
// replies always arrive. That is not a dark pattern, it is the honest shape of the
// product — and saying so is what makes the other switches believable.

import React, {useCallback, useEffect, useState} from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, ActivityIndicator,
  Alert, Linking, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {LanguageContext} from '../../context/LanguageContext';
import {captureEvent} from '../../utils/Analytics';
import {probePermissionStatus} from '../../utils/notificationDevice';

const QUIET_PRESETS = [
  {start: null, end: null, key: 'notifPrefs.quietOff'},
  {start: 22, end: 8, key: 'notifPrefs.quiet22to8'},
  {start: 21, end: 9, key: 'notifPrefs.quiet21to9'},
  {start: 23, end: 7, key: 'notifPrefs.quiet23to7'},
];

const NotificationSettings = () => {
  const {t} = React.useContext(LanguageContext);
  const [prefs, setPrefs] = useState(null);
  const [defaults, setDefaults] = useState({quiet_start: 22, quiet_end: 8});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState('granted');

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      const {data} = await Instance.get('/api/notifications/preferences', {
        headers: {Authorization: `Bearer ${token}`},
      });
      setPrefs(data.preferences);
      if (data.defaults) setDefaults(data.defaults);
    } catch (e) {
      // An unreachable server must not show an empty screen with no explanation —
      // fall back to the defaults, which are also what the server would apply.
      setPrefs({promotional: true, engagement: true, horoscope: true, quiet_start: null, quiet_end: null});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    probePermissionStatus().then(setPermission).catch(() => {});
  }, [load]);

  const save = async patch => {
    const next = {...prefs, ...patch};
    setPrefs(next); // optimistic — a toggle that lags behind the finger feels broken
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const {data} = await Instance.patch('/api/notifications/preferences', patch, {
        headers: {Authorization: `Bearer ${token}`},
      });
      setPrefs(data.preferences);
      captureEvent('notification_prefs_changed', Object.keys(patch).reduce((acc, k) => {
        acc[k] = patch[k];
        return acc;
      }, {}));
    } catch (e) {
      setPrefs(prefs); // put the switch back where it was
      Alert.alert(t('notifPrefs.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openSystemSettings = () => {
    captureEvent('notification_prefs_open_os_settings', {permission});
    Linking.openSettings().catch(() => {});
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={COLORS.AstroMaroon} />
      </View>
    );
  }

  const osOff = permission === 'denied' || permission === 'blocked';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* The OS switch beats everything below it, so when it is off nothing on
            this screen can work — saying that first is the difference between a
            settings page and a page of switches that do nothing. */}
        {osOff && (
          <TouchableOpacity style={styles.warning} onPress={openSystemSettings}>
            <Icon name="notifications-off" size={22} color="#92400E" />
            <View style={styles.warningText}>
              <Text style={styles.warningTitle}>{t('notifPrefs.osOffTitle')}</Text>
              <Text style={styles.warningBody}>{t('notifPrefs.osOffBody')}</Text>
            </View>
            <Icon name="keyboard-arrow-right" size={22} color="#92400E" />
          </TouchableOpacity>
        )}

        <Text style={styles.sectionLabel}>{t('notifPrefs.alwaysOnLabel')}</Text>
        <View style={styles.lockedCard}>
          <Icon name="verified-user" size={20} color={COLORS.AstroMaroon} />
          <View style={styles.lockedTextWrap}>
            <Text style={styles.lockedTitle}>{t('notifPrefs.alwaysOnTitle')}</Text>
            <Text style={styles.lockedBody}>{t('notifPrefs.alwaysOnBody')}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>{t('notifPrefs.chooseLabel')}</Text>

        <Row
          icon="local-offer"
          title={t('notifPrefs.promoTitle')}
          body={t('notifPrefs.promoBody')}
          value={prefs?.promotional !== false}
          onChange={v => save({promotional: v})}
          disabled={saving}
        />
        <Row
          icon="auto-awesome"
          title={t('notifPrefs.engagementTitle')}
          body={t('notifPrefs.engagementBody')}
          value={prefs?.engagement !== false}
          onChange={v => save({engagement: v})}
          disabled={saving}
        />
        <Row
          icon="wb-sunny"
          title={t('notifPrefs.horoscopeTitle')}
          body={t('notifPrefs.horoscopeBody')}
          value={prefs?.horoscope !== false}
          onChange={v => save({horoscope: v})}
          disabled={saving}
        />

        <Text style={styles.sectionLabel}>{t('notifPrefs.quietLabel')}</Text>
        <View style={styles.quietCard}>
          <Text style={styles.quietHint}>
            {t('notifPrefs.quietHint', {start: defaults.quiet_start, end: defaults.quiet_end})}
          </Text>
          {QUIET_PRESETS.map(p => {
            const active = (prefs?.quiet_start ?? null) === p.start && (prefs?.quiet_end ?? null) === p.end;
            return (
              <TouchableOpacity
                key={p.key}
                style={[styles.quietOption, active && styles.quietOptionActive]}
                onPress={() => save({quiet_start: p.start, quiet_end: p.end})}
                disabled={saving}>
                <Icon
                  name={active ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={20}
                  color={active ? COLORS.AstroMaroon : '#B3A296'}
                />
                <Text style={[styles.quietOptionText, active && styles.quietOptionTextActive]}>
                  {t(p.key)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.osRow} onPress={openSystemSettings}>
          <Icon name="settings" size={20} color={COLORS.AstroMaroon} />
          <Text style={styles.osRowText}>
            {Platform.OS === 'ios' ? t('notifPrefs.openIosSettings') : t('notifPrefs.openAndroidSettings')}
          </Text>
          <Icon name="keyboard-arrow-right" size={22} color="#000" />
        </TouchableOpacity>

        <Text style={styles.footer}>{t('notifPrefs.footer')}</Text>
      </ScrollView>
    </View>
  );
};

const Row = ({icon, title, body, value, onChange, disabled}) => (
  <View style={styles.row}>
    <Icon name={icon} size={20} color={COLORS.AstroMaroon} style={styles.rowIcon} />
    <View style={styles.rowTextWrap}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowBody}>{body}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{false: '#DDD3CA', true: '#C9A27E'}}
      thumbColor={value ? COLORS.AstroMaroon : '#FFF'}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.white},
  center: {alignItems: 'center', justifyContent: 'center'},
  scroll: {padding: scale(16), paddingBottom: verticalScale(40)},
  sectionLabel: {
    fontSize: moderateScale(12),
    fontWeight: '700',
    color: '#8A7A6D',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: verticalScale(18),
    marginBottom: verticalScale(8),
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: moderateScale(12),
    padding: scale(12),
  },
  warningText: {flex: 1, marginHorizontal: scale(10)},
  warningTitle: {fontSize: moderateScale(13.5), fontWeight: '700', color: '#92400E'},
  warningBody: {fontSize: moderateScale(12), color: '#92400E', marginTop: 2},
  lockedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FAF7F4',
    borderRadius: moderateScale(12),
    padding: scale(13),
  },
  lockedTextWrap: {flex: 1, marginLeft: scale(10)},
  lockedTitle: {fontSize: moderateScale(13.5), fontWeight: '700', color: '#2B2118'},
  lockedBody: {fontSize: moderateScale(12), color: '#6B5E52', marginTop: 3, lineHeight: moderateScale(17)},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: '#F2ECE6',
  },
  rowIcon: {marginRight: scale(10)},
  rowTextWrap: {flex: 1, marginRight: scale(8)},
  rowTitle: {fontSize: moderateScale(14), fontWeight: '600', color: '#2B2118'},
  rowBody: {fontSize: moderateScale(11.5), color: '#8A7A6D', marginTop: 2, lineHeight: moderateScale(16)},
  quietCard: {backgroundColor: '#FAF7F4', borderRadius: moderateScale(12), padding: scale(12)},
  quietHint: {fontSize: moderateScale(11.5), color: '#8A7A6D', marginBottom: verticalScale(8)},
  quietOption: {flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(9)},
  quietOptionActive: {},
  quietOptionText: {fontSize: moderateScale(13.5), color: '#4A4036', marginLeft: scale(9)},
  quietOptionTextActive: {fontWeight: '700', color: '#2B2118'},
  osRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(20),
    paddingVertical: verticalScale(13),
    borderTopWidth: 1,
    borderTopColor: '#F2ECE6',
  },
  osRowText: {flex: 1, fontSize: moderateScale(13.5), color: '#2B2118', marginLeft: scale(10)},
  footer: {
    fontSize: moderateScale(11),
    color: '#A2958A',
    marginTop: verticalScale(16),
    lineHeight: moderateScale(16),
  },
});

export default NotificationSettings;
