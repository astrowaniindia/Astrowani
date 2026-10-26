// ─────────────────────────────────────────────────────────────────────────────
// Blocked astrologers — the list, and the only way to undo a block.
//
// Added 2026-10-24. Blocking shipped on 2026-10-23 with no way back: the block was
// written, enforced server-side, and then invisible everywhere in the app. A
// moderation control the person cannot reverse is also one they will not risk
// using, so the missing half was not a nicety.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useContext, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { fetchBlockedAstrologerList, unblockAstrologer } from '../../utils/blockedAstrologers';

export default function BlockedAstrologersScreen() {
  const { t } = useContext(LanguageContext);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Per-row, not one screen-wide flag: unblocking one astrologer must not put a
  // spinner on every other row.
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchBlockedAstrologerList();
    setRows(res.rows || []);
    setFailed(!res.ok);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmUnblock = (row) => {
    Alert.alert(
      t('blocked.confirmTitle').replace('{{name}}', row.name),
      t('blocked.confirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('blocked.unblock'),
          onPress: async () => {
            setBusyId(row.astrologerId);
            const res = await unblockAstrologer(row.astrologerId);
            setBusyId(null);
            if (!res.ok) {
              Alert.alert(t('blocked.unblockFailed'));
              return;
            }
            // Removed locally rather than re-fetched: the store has already rolled the
            // change forward (and would roll it back on failure), so a round trip here
            // would only make a finished action look slow.
            setRows((prev) => prev.filter((r) => r.astrologerId !== row.astrologerId));
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {failed && <Text style={styles.failed}>{t('blocked.loadFailed')}</Text>}
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id || item.astrologerId)}
        contentContainerStyle={rows.length ? styles.listPad : styles.emptyWrap}
        ListEmptyComponent={
          failed ? null : (
            <View style={styles.empty}>
              <MaterialIcons name="block" size={moderateScale(46)} color="#d8c9bd" />
              <Text style={styles.emptyTitle}>{t('blocked.empty')}</Text>
              <Text style={styles.emptyHint}>{t('blocked.emptyHint')}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>{(item.name || 'A').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              {!!item.reason && <Text style={styles.reason} numberOfLines={1}>{item.reason}</Text>}
            </View>
            <TouchableOpacity
              style={[styles.unblockBtn, busyId === item.astrologerId && styles.unblockBtnBusy]}
              disabled={busyId === item.astrologerId}
              onPress={() => confirmUnblock(item)}>
              <Text style={styles.unblockTxt}>
                {busyId === item.astrologerId ? t('blocked.unblocking') : t('blocked.unblock')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.AstroSoftOrange },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.AstroSoftOrange },
  listPad: { padding: scale(16) },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  failed: { textAlign: 'center', color: '#a33', paddingVertical: verticalScale(10), fontSize: moderateScale(13) },
  empty: { alignItems: 'center', paddingHorizontal: scale(32), gap: verticalScale(8) },
  emptyTitle: { fontSize: moderateScale(16), fontFamily: 'Poppins-Bold', color: '#5a4336' },
  emptyHint: { fontSize: moderateScale(12.5), color: '#8a7466', textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: scale(12),
    backgroundColor: '#fff', borderRadius: moderateScale(14),
    padding: scale(12), marginBottom: verticalScale(10),
  },
  avatar: {
    width: scale(42), height: scale(42), borderRadius: scale(21),
    backgroundColor: COLORS.AstroMaroon, alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { color: '#fff', fontSize: moderateScale(17), fontFamily: 'Poppins-Bold' },
  rowBody: { flex: 1 },
  name: { fontSize: moderateScale(14.5), fontFamily: 'Poppins-Bold', color: '#2f2119' },
  reason: { fontSize: moderateScale(11.5), color: '#8a7466', marginTop: 1 },
  unblockBtn: {
    paddingHorizontal: scale(14), paddingVertical: verticalScale(7),
    borderRadius: moderateScale(18), borderWidth: 1.2, borderColor: COLORS.AstroMaroon,
  },
  unblockBtnBusy: { opacity: 0.55 },
  unblockTxt: { color: COLORS.AstroMaroon, fontSize: moderateScale(12.5), fontFamily: 'Poppins-Bold' },
});
