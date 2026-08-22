// "Referrals & Commission" — what this astrologer has recommended, and what it earned.
//
// Commission is paid only once an order is DELIVERED, so this screen splits earnings into
// Paid and Pending deliberately. Showing one combined figure would tell an astrologer they
// have earned money that a cancellation could still take away, which is the sort of number
// that generates a support message.
//
// Recommendations are created from MyCustomers (pick a customer → pick a remedy). This
// screen is read-only on purpose: it is the ledger, not the entry point.
import React, { useCallback, useContext, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';

const TYPE_LABEL = {
  gemstone: 'Gemstone',
  puja: 'Puja',
  specific_puja: 'Specific Puja',
};

const RemedyReferrals = () => {
  const { t } = useContext(LanguageContext);
  const [referrals, setReferrals] = useState([]);
  const [earnings, setEarnings] = useState({ paid: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.get('/api/vendor/remedy-referrals', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) {
        setReferrals(res.data.referrals || []);
        setEarnings(res.data.earnings || { paid: 0, pending: 0 });
      }
    } catch (e) {
      console.log('[RemedyReferrals] load failed:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const renderItem = ({ item }) => {
    const remedy = item.remedy_items || {};
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.itemTitle} numberOfLines={2}>{remedy.title || 'Remedy'}</Text>
          {!!remedy.price && <Text style={styles.itemPrice}>₹{remedy.price}</Text>}
        </View>
        <View style={styles.metaRow}>
          {!!remedy.type && (
            <View style={styles.typePill}>
              <Text style={styles.typePillTxt}>{TYPE_LABEL[remedy.type] || remedy.type}</Text>
            </View>
          )}
          {/* An admin-attributed referral is worth showing: the astrologer didn't create
              it themselves, so seeing it appear needs an explanation. */}
          {item.source === 'admin' && (
            <View style={[styles.typePill, styles.adminPill]}>
              <Text style={[styles.typePillTxt, styles.adminPillTxt]}>Added by Astrowani</Text>
            </View>
          )}
          <Text style={styles.date}>
            {item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : ''}
          </Text>
        </View>
        {!!item.note && <Text style={styles.note}>{item.note}</Text>}
      </View>
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
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Paid to you</Text>
          <Text style={styles.summaryValue}>₹{earnings.paid}</Text>
          <Text style={styles.summaryHint}>Already in your wallet</Text>
        </View>
        <View style={[styles.summaryBox, styles.summaryBoxAlt]}>
          <Text style={styles.summaryLabel}>Pending</Text>
          <Text style={[styles.summaryValue, styles.pendingValue]}>₹{earnings.pending}</Text>
          <Text style={styles.summaryHint}>Pays out once delivered</Text>
        </View>
      </View>

      <FlatList
        data={referrals}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.AstroMaroon]} />}
        ListHeaderComponent={
          referrals.length ? <Text style={styles.sectionHeader}>Your recommendations</Text> : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="sparkles-outline" size={moderateScale(46)} color="rgba(89,42,25,0.25)" />
            <Text style={styles.emptyTitle}>No recommendations yet</Text>
            <Text style={styles.emptyBody}>
              Open “My Customers”, pick someone you’ve consulted, and tap “Recommend a remedy”.
              If they buy it, your commission appears here.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBF7F4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F4' },

  summaryRow: { flexDirection: 'row', gap: scale(10), padding: scale(14), paddingBottom: 0 },
  summaryBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: moderateScale(12),
    padding: scale(14), borderWidth: 1, borderColor: 'rgba(89,42,25,0.12)',
  },
  summaryBoxAlt: { borderColor: 'rgba(212,160,23,0.35)' },
  summaryLabel: { fontSize: moderateScale(12), color: '#7A6B64', marginBottom: verticalScale(4) },
  summaryValue: { fontSize: moderateScale(22), fontWeight: '700', color: COLORS.AstroMaroon },
  pendingValue: { color: '#96591A' },
  summaryHint: { fontSize: moderateScale(10.5), color: '#9C8B83', marginTop: verticalScale(2) },

  sectionHeader: {
    fontSize: moderateScale(13), fontWeight: '700', color: COLORS.AstroMaroon,
    marginBottom: verticalScale(8), marginTop: verticalScale(4),
  },
  listContent: { padding: scale(14) },

  card: {
    backgroundColor: '#fff', borderRadius: moderateScale(12), padding: scale(13),
    marginBottom: verticalScale(10), borderWidth: 1, borderColor: 'rgba(89,42,25,0.10)',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: scale(8) },
  itemTitle: { flex: 1, fontSize: moderateScale(14), fontWeight: '600', color: '#241A16' },
  itemPrice: { fontSize: moderateScale(14), fontWeight: '700', color: COLORS.AstroMaroon },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: scale(6), marginTop: verticalScale(8) },
  typePill: {
    backgroundColor: 'rgba(89,42,25,0.08)', borderRadius: moderateScale(20),
    paddingHorizontal: scale(9), paddingVertical: verticalScale(3),
  },
  typePillTxt: { fontSize: moderateScale(10.5), color: COLORS.AstroMaroon, fontWeight: '600' },
  adminPill: { backgroundColor: 'rgba(212,160,23,0.18)' },
  adminPillTxt: { color: '#8A6208' },
  date: { fontSize: moderateScale(11), color: '#9C8B83', marginLeft: 'auto' },
  note: { fontSize: moderateScale(12), color: '#6B5C55', marginTop: verticalScale(7), fontStyle: 'italic' },

  empty: { alignItems: 'center', paddingTop: verticalScale(60), paddingHorizontal: scale(30) },
  emptyTitle: {
    fontSize: moderateScale(15), fontWeight: '700', color: COLORS.AstroMaroon,
    marginTop: verticalScale(12), marginBottom: verticalScale(6),
  },
  emptyBody: { fontSize: moderateScale(12.5), color: '#7A6B64', textAlign: 'center', lineHeight: moderateScale(19) },
});

export default RemedyReferrals;
