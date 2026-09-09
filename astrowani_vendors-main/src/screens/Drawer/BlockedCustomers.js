// Blocked customers — review and undo.
//
// A block has to be reversible from inside the app, not only support-ticketable:
// both stores expect the user who blocked to be able to manage that list, and an
// astrologer who blocks someone by accident otherwise loses a paying customer
// permanently with no way back.
//
// Reached from Settings. Phone numbers arrive masked from the backend (last four
// digits only) — enough to recognise who this is, without handing back the full
// number of somebody they have deliberately cut contact with.
import React, { useCallback, useContext, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import { getBlocked, unblockCustomer } from '../../api/ModerationApi';
import { showStatusPopup } from '../../components/StatusPopup';

export default function BlockedCustomers({ navigation }) {
  const { t } = useContext(LanguageContext);
  // This screen owns its header, so it owns the safe-area inset too — the exact
  // omission that put Support.tsx's title under the dynamic island.
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);   // distinct from "genuinely empty"
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const res = await getBlocked();
    setRows(res.blocked);
    setFailed(!res.ok);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmUnblock = (row) => {
    showStatusPopup({
      variant: 'info',
      title: t('moderation.unblockTitle'),
      message: t('moderation.unblockConfirm', { name: row.name }),
      confirmText: t('moderation.unblockAction'),
      cancelText: t('moderation.cancel'),
      onConfirm: () => doUnblock(row),
    });
  };

  const doUnblock = async (row) => {
    setBusyId(row.customerId);
    try {
      await unblockCustomer({ customerId: row.customerId });
      // Drop it locally rather than refetching: instant, and a failed refetch
      // would otherwise make a successful unblock look like it did nothing.
      setRows((prev) => prev.filter((r) => r.customerId !== row.customerId));
    } catch (e) {
      showStatusPopup({
        variant: 'error',
        title: t('moderation.unblockFailedTitle'),
        message: e?.message || t('moderation.unblockFailedBody'),
      });
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <MaterialIcons name="person-off" size={moderateScale(22)} color={COLORS.AstroMaroon} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        {!!item.mobile && <Text style={styles.meta}>{item.mobile}</Text>}
        {!!item.reason && (
          <Text style={styles.meta}>{t(`moderation.reason.${item.reason}`, {}) || item.reason}</Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.unblockBtn}
        activeOpacity={0.85}
        disabled={busyId === item.customerId}
        onPress={() => confirmUnblock(item)}>
        {busyId === item.customerId
          ? <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
          : <Text style={styles.unblockText}>{t('moderation.unblockAction')}</Text>}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + verticalScale(13) }]}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="arrow-back" size={moderateScale(23)} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('moderation.blockedTitle')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: verticalScale(40) }} color={COLORS.AstroMaroon} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={rows.length ? styles.list : styles.listEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons
                name={failed ? 'cloud-off' : 'verified-user'}
                size={moderateScale(44)}
                color="#c9b8ae"
              />
              {/* "Couldn't load" and "nobody is blocked" must not look identical —
                  one is a problem to retry, the other is the good outcome. */}
              <Text style={styles.emptyText}>
                {failed ? t('moderation.blockedLoadFailed') : t('moderation.blockedEmpty')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf7f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(14),
    // paddingTop comes from the safe-area inset inline; only the bottom is fixed.
    paddingBottom: verticalScale(13),
  },
  headerTitle: {
    color: '#fff', fontSize: moderateScale(16), fontFamily: 'Lato-Bold',
    fontWeight: 'bold', marginLeft: scale(12),
  },
  list: { padding: scale(14) },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: moderateScale(12), padding: scale(12), marginBottom: verticalScale(9),
    borderWidth: 1, borderColor: '#f0e6e0',
  },
  avatar: {
    width: scale(40), height: scale(40), borderRadius: scale(20),
    backgroundColor: 'rgba(89,42,25,0.08)', alignItems: 'center', justifyContent: 'center',
    marginRight: scale(11),
  },
  name: { fontSize: moderateScale(14), fontFamily: 'Lato-Bold', fontWeight: 'bold', color: '#3b2a20' },
  meta: { fontSize: moderateScale(11), color: '#7b6a60', marginTop: verticalScale(1) },
  unblockBtn: {
    paddingHorizontal: scale(14), paddingVertical: verticalScale(8),
    borderRadius: moderateScale(9), borderWidth: 1, borderColor: COLORS.AstroMaroon,
    minWidth: scale(74), alignItems: 'center',
  },
  unblockText: {
    color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', fontWeight: 'bold', fontSize: moderateScale(12),
  },
  empty: { alignItems: 'center', paddingHorizontal: scale(40) },
  emptyText: {
    marginTop: verticalScale(12), fontSize: moderateScale(13),
    color: '#7b6a60', textAlign: 'center', lineHeight: verticalScale(19),
  },
});
