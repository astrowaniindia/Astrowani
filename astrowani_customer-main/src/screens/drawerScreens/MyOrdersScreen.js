import React, { useContext, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Modal,
  TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import FastImage from 'react-native-fast-image';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import { listOrders, cancelOrder } from '../../api/OrdersApi';
import SHOP, { cardShadow } from '../../components/shop/shopTheme';

const TYPE_LABEL_KEY = {
  puja: 'orders.typePuja',
  gemstone: 'orders.typeGemstone',
  specific_puja: 'orders.typeSpecificPuja',
  life_report: 'orders.typeLifeReport',
};

// The fulfilment path a physical order walks, in order. Used to draw the timeline's
// "done / not yet" state — the backend's order_status_events supplies the actual history,
// this is only what the remaining steps are called.
const TRACK_STEPS = ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'completed'];

// Warm, brand-consistent status colours. 'placed' is amber (in the queue), the middle
// fulfilment states are blue (moving), delivered is green, cancelled is red.
function statusColor(status) {
  if (status === 'completed') return SHOP.success;
  if (status === 'cancelled') return SHOP.danger;
  if (status === 'placed' || status === 'pending_payment') return '#D98A00';
  return '#2E6DA4';
}

const MyOrdersScreen = ({ navigation }) => {
  const { t } = useContext(LanguageContext);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewingReport, setViewingReport] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      setOrders(await listOrders());
    } catch (e) {
      console.warn('Orders fetch error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  const confirmCancel = (order) => {
    const refundNote = order.payment_status === 'paid'
      ? (order.payment_method === 'wallet' ? t('orders.cancelRefundWallet') : t('orders.cancelRefundOnline'))
      : '';
    Alert.alert(
      t('orders.cancelTitle'),
      `${t('orders.cancelMessage')}${refundNote ? `\n\n${refundNote}` : ''}`,
      [
        { text: t('orders.keepOrder'), style: 'cancel' },
        {
          text: t('orders.cancelOrder'),
          style: 'destructive',
          onPress: async () => {
            setCancellingId(order.id);
            try {
              const res = await cancelOrder(order.id);
              await fetchOrders();
              if (res?.refund?.refunded) {
                Alert.alert(t('orders.cancelled'), t('orders.refundedToWallet', { amount: res.refund.amount }));
              } else if (res?.refund?.pending) {
                Alert.alert(t('orders.cancelled'), t('orders.refundPending'));
              }
            } catch (err) {
              Alert.alert(t('common.error'), err.message);
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  };

  const renderTimeline = (order) => {
    // A cancelled order didn't walk the happy path, so showing greyed-out future steps
    // would be misleading — just the events that actually happened.
    if (order.status === 'cancelled') {
      return (
        <View style={styles.timeline}>
          {(order.timeline || []).map((ev) => (
            <View key={ev.id} style={styles.trackRow}>
              <Icon name="cancel" size={moderateScale(15)} color={SHOP.danger} />
              <View style={styles.trackTextCol}>
                <Text style={styles.trackLabelDone}>{t(`orders.status_${ev.status}`)}</Text>
                {ev.note ? <Text style={styles.trackNote}>{ev.note}</Text> : null}
              </View>
              <Text style={styles.trackTime}>
                {new Date(ev.created_at).toLocaleDateString('en-IN')}
              </Text>
            </View>
          ))}
        </View>
      );
    }

    const reached = new Set((order.timeline || []).map((e) => e.status));
    const eventByStatus = {};
    for (const ev of order.timeline || []) eventByStatus[ev.status] = ev;
    const currentIndex = TRACK_STEPS.lastIndexOf(order.status);

    return (
      <View style={styles.timeline}>
        {TRACK_STEPS.map((step, i) => {
          const done = reached.has(step) || i <= currentIndex;
          const ev = eventByStatus[step];
          return (
            <View key={step} style={styles.trackRow}>
              <Icon
                name={done ? 'check-circle' : 'radio-button-unchecked'}
                size={moderateScale(15)}
                color={done ? SHOP.success : '#D6CCC4'}
              />
              <View style={styles.trackTextCol}>
                <Text style={done ? styles.trackLabelDone : styles.trackLabel}>
                  {t(`orders.status_${step}`)}
                </Text>
                {ev?.note ? <Text style={styles.trackNote}>{ev.note}</Text> : null}
              </View>
              {ev ? (
                <Text style={styles.trackTime}>
                  {new Date(ev.created_at).toLocaleDateString('en-IN')}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const items = item.items || [];
    const expanded = expandedId === item.id;
    const isLifeReport = item.item_type === 'life_report';

    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setExpandedId(expanded ? null : item.id)}>
          <View style={styles.cardHeader}>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.item_title}</Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor(item.status) }]}>
              <Text style={styles.statusPillText}>{t(`orders.status_${item.status}`).toUpperCase()}</Text>
            </View>
          </View>

          {/* Thumbnail strip — reads as "an order of things" at a glance, which the old
              single-title-only card couldn't do now that an order can hold many items. */}
          {items.length > 1 ? (
            <View style={styles.thumbRow}>
              {items.slice(0, 4).map((line, i) => (
                <FastImage
                  key={`${line.item_id || i}`}
                  source={{ uri: line.image || undefined }}
                  style={styles.thumb}
                  resizeMode={FastImage.resizeMode.cover}
                />
              ))}
              {items.length > 4 ? (
                <View style={[styles.thumb, styles.thumbMore]}>
                  <Text style={styles.thumbMoreText}>+{items.length - 4}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.itemMeta}>
            {TYPE_LABEL_KEY[item.item_type] ? t(TYPE_LABEL_KEY[item.item_type]) : item.item_type}
            {' · '}₹{item.grand_total ?? item.total}
            {items.length > 1 ? ` · ${t('orders.nItems', { count: items.length })}` : ''}
          </Text>
          <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleDateString('en-IN')}</Text>

          {isLifeReport ? (
            item.report_content ? (
              <TouchableOpacity style={styles.reportReadyRow} onPress={() => setViewingReport(item)}>
                <Icon name="description" size={16} color={COLORS.AstroMaroon} />
                <Text style={styles.reportReadyText}>{t('orders.reportDelivered')}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.reportPendingText}>{t('orders.reportPending')}</Text>
            )
          ) : null}

          <View style={styles.expandRow}>
            <Text style={styles.expandText}>
              {expanded ? t('orders.hideDetails') : t('orders.viewDetails')}
            </Text>
            <Icon
              name={expanded ? 'expand-less' : 'expand-more'}
              size={moderateScale(18)}
              color={COLORS.AstroMaroon}
            />
          </View>
        </TouchableOpacity>

        {expanded ? (
          <View style={styles.details}>
            {items.map((line, i) => (
              <View key={`${line.item_id || i}`} style={styles.detailLine}>
                <Text style={styles.detailLineTitle} numberOfLines={1}>{line.item_title}</Text>
                <Text style={styles.detailLineQty}>× {line.quantity}</Text>
                <Text style={styles.detailLineTotal}>₹{line.line_total}</Text>
              </View>
            ))}

            {/* Fee breakdown, only for orders that have one — legacy rows don't. */}
            {item.grand_total != null ? (
              <View style={styles.feeBlock}>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>{t('cart.itemTotal')}</Text>
                  <Text style={styles.feeValue}>₹{item.subtotal}</Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>{t('cart.deliveryCharge')}</Text>
                  <Text style={styles.feeValue}>
                    {Number(item.delivery_fee) === 0 ? 'FREE' : `₹${item.delivery_fee}`}
                  </Text>
                </View>
                {Number(item.handling_fee) > 0 ? (
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>{t('cart.handlingCharge')}</Text>
                    <Text style={styles.feeValue}>₹{item.handling_fee}</Text>
                  </View>
                ) : null}
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabelStrong}>{t('cart.toPay')}</Text>
                  <Text style={styles.feeValueStrong}>₹{item.grand_total}</Text>
                </View>
              </View>
            ) : null}

            {item.delivery_address ? (
              <View style={styles.addressBlock}>
                <Text style={styles.blockHeading}>{t('cart.deliverTo')}</Text>
                <Text style={styles.addressText}>
                  {item.delivery_address.full_name} · {item.delivery_address.phone}
                </Text>
                <Text style={styles.addressText}>
                  {[
                    item.delivery_address.house_flat, item.delivery_address.street_area,
                    item.delivery_address.landmark, item.delivery_address.city,
                    item.delivery_address.state, item.delivery_address.pincode,
                  ].filter(Boolean).join(', ')}
                </Text>
              </View>
            ) : null}

            {!isLifeReport && (item.timeline || []).length ? (
              <>
                <Text style={styles.blockHeading}>{t('orders.tracking')}</Text>
                {renderTimeline(item)}
              </>
            ) : null}

            {item.cancellable ? (
              <TouchableOpacity
                style={styles.cancelBtn}
                disabled={cancellingId === item.id}
                onPress={() => confirmCancel(item)}>
                {cancellingId === item.id ? (
                  <ActivityIndicator size="small" color={COLORS.red} />
                ) : (
                  <Text style={styles.cancelBtnText}>{t('orders.cancelOrder')}</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.containerCenter}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchOrders(true)} />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconCircle}>
              <Icon name="shopping-bag" size={moderateScale(36)} color={SHOP.textMuted} />
            </View>
            <Text style={styles.emptyText}>{t('orders.noOrders')}</Text>
            <TouchableOpacity
              style={styles.shopBtn}
              onPress={() => navigation.navigate('Store')}>
              <Text style={styles.shopBtnText}>{t('cart.startShopping')}</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <Modal visible={!!viewingReport} transparent animationType="slide" onRequestClose={() => setViewingReport(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{viewingReport?.item_title}</Text>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.reportText}>{viewingReport?.report_content}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setViewingReport(null)}>
              <Text style={styles.closeBtnText}>{t('orders.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SHOP.screenBg },
  containerCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: SHOP.surface },
  list: { padding: scale(14) },

  card: { ...cardShadow, padding: scale(14), marginBottom: verticalScale(12) },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(3) },
  itemTitle: {
    fontSize: moderateScale(14.5),
    fontFamily: 'Lato-Bold',
    color: SHOP.text,
    flex: 1,
    marginRight: scale(8),
  },
  statusPill: { paddingHorizontal: scale(9), paddingVertical: verticalScale(3), borderRadius: moderateScale(12) },
  statusPillText: { fontSize: moderateScale(9.5), fontFamily: 'Lato-Bold', color: '#fff', letterSpacing: 0.4 },

  thumbRow: { flexDirection: 'row', marginVertical: verticalScale(8) },
  thumb: {
    width: scale(42),
    height: scale(42),
    borderRadius: moderateScale(8),
    backgroundColor: SHOP.surfaceAlt,
    marginRight: scale(6),
  },
  thumbMore: { alignItems: 'center', justifyContent: 'center', backgroundColor: SHOP.brandTint },
  thumbMoreText: { fontSize: moderateScale(11), color: SHOP.brand, fontFamily: 'Lato-Bold' },

  itemMeta: { fontSize: moderateScale(12.5), color: SHOP.textSoft, marginBottom: verticalScale(1) },
  itemDate: { fontSize: moderateScale(11), color: SHOP.textMuted },

  reportReadyRow: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(9) },
  reportReadyText: {
    fontSize: moderateScale(13),
    color: SHOP.brand,
    fontFamily: 'Lato-Bold',
    marginLeft: scale(6),
  },
  reportPendingText: {
    fontSize: moderateScale(12),
    color: SHOP.textMuted,
    marginTop: verticalScale(9),
    fontStyle: 'italic',
  },

  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(9),
    paddingTop: verticalScale(8),
    borderTopWidth: 1,
    borderTopColor: SHOP.border,
  },
  expandText: { fontSize: moderateScale(12), color: SHOP.brand, fontFamily: 'Lato-Bold' },

  details: { marginTop: verticalScale(6) },
  detailLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(5) },
  detailLineTitle: { flex: 1, fontSize: moderateScale(12.5), color: SHOP.textSoft },
  detailLineQty: { fontSize: moderateScale(12), color: SHOP.textMuted, marginHorizontal: scale(8) },
  detailLineTotal: {
    fontSize: moderateScale(12.5),
    color: SHOP.text,
    fontFamily: 'Lato-Bold',
    minWidth: scale(52),
    textAlign: 'right',
  },

  feeBlock: {
    marginTop: verticalScale(9),
    borderTopWidth: 1,
    borderTopColor: SHOP.border,
    paddingTop: verticalScale(8),
  },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: verticalScale(2) },
  feeLabel: { fontSize: moderateScale(12), color: SHOP.textMuted },
  feeValue: { fontSize: moderateScale(12), color: SHOP.textSoft },
  feeLabelStrong: { fontSize: moderateScale(13), color: SHOP.text, fontFamily: 'Lato-Bold' },
  feeValueStrong: { fontSize: moderateScale(14.5), color: SHOP.brand, fontFamily: 'Lato-Bold' },

  addressBlock: { marginTop: verticalScale(12) },
  blockHeading: {
    fontSize: moderateScale(10.5),
    color: SHOP.textMuted,
    fontFamily: 'Lato-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: verticalScale(13),
    marginBottom: verticalScale(5),
  },
  addressText: { fontSize: moderateScale(12.5), color: SHOP.textSoft, lineHeight: verticalScale(18) },

  timeline: { marginTop: verticalScale(2) },
  trackRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(5) },
  trackTextCol: { flex: 1, marginLeft: scale(9) },
  trackLabel: { fontSize: moderateScale(12), color: '#BDB1A8' },
  trackLabelDone: { fontSize: moderateScale(12), color: SHOP.text, fontFamily: 'Lato-Bold' },
  trackNote: { fontSize: moderateScale(11), color: SHOP.textMuted },
  trackTime: { fontSize: moderateScale(10), color: SHOP.textMuted },

  cancelBtn: {
    borderWidth: 1.5,
    borderColor: SHOP.danger,
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(10),
    alignItems: 'center',
    marginTop: verticalScale(15),
  },
  cancelBtnText: { color: SHOP.danger, fontFamily: 'Lato-Bold', fontSize: moderateScale(13) },

  emptyBox: { alignItems: 'center', paddingVertical: verticalScale(70) },
  emptyIconCircle: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    backgroundColor: SHOP.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: moderateScale(14.5),
    fontFamily: 'Lato-Bold',
    color: SHOP.text,
    marginTop: verticalScale(14),
  },
  shopBtn: {
    backgroundColor: SHOP.brand,
    borderRadius: moderateScale(11),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(28),
    marginTop: verticalScale(20),
  },
  shopBtnText: { color: '#fff', fontFamily: 'Lato-Bold', fontSize: moderateScale(14) },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: SHOP.surface,
    borderTopLeftRadius: moderateScale(22),
    borderTopRightRadius: moderateScale(22),
    padding: scale(20),
    maxHeight: '75%',
  },
  modalTitle: {
    fontSize: moderateScale(17),
    fontFamily: 'Lato-Bold',
    color: SHOP.brand,
    marginBottom: verticalScale(12),
  },
  modalScroll: { marginBottom: verticalScale(16) },
  reportText: { fontSize: moderateScale(13.5), color: SHOP.textSoft, lineHeight: verticalScale(21) },
  closeBtn: {
    backgroundColor: SHOP.brand,
    borderRadius: moderateScale(11),
    paddingVertical: verticalScale(13),
    alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontFamily: 'Lato-Bold', fontSize: moderateScale(15) },
});

export default MyOrdersScreen;
