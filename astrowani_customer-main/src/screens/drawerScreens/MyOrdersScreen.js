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

function statusColor(status) {
  if (status === 'completed') return '#4CAF50';
  if (status === 'cancelled') return '#D32F2F';
  return '#F5A623';
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
              <Icon name="cancel" size={moderateScale(15)} color="#D32F2F" />
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
                color={done ? '#4CAF50' : '#ccc'}
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
            <Icon name="shopping-bag" size={40} color="#ccc" />
            <Text style={styles.emptyText}>{t('orders.noOrders')}</Text>
            <TouchableOpacity
              style={styles.shopBtn}
              onPress={() => navigation.navigate('DrawerRemedies')}>
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
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  containerCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  list: { padding: scale(14) },
  card: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: scale(14),
    marginBottom: verticalScale(12),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  itemTitle: { fontSize: moderateScale(15), fontWeight: 'bold', color: '#222', flex: 1, marginRight: scale(8) },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusPillText: { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  thumbRow: { flexDirection: 'row', marginVertical: verticalScale(6) },
  thumb: {
    width: scale(38), height: scale(38), borderRadius: moderateScale(6),
    backgroundColor: '#f0f0f0', marginRight: scale(6),
  },
  thumbMore: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee' },
  thumbMoreText: { fontSize: moderateScale(11), color: '#777', fontWeight: 'bold' },
  itemMeta: { fontSize: moderateScale(13), color: '#777', marginBottom: 2 },
  itemDate: { fontSize: moderateScale(11), color: '#aaa' },
  reportReadyRow: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(8) },
  reportReadyText: { fontSize: moderateScale(13), color: COLORS.AstroMaroon, fontWeight: '600', marginLeft: 6 },
  reportPendingText: { fontSize: moderateScale(12), color: '#999', marginTop: verticalScale(8), fontStyle: 'italic' },

  expandRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: verticalScale(8), paddingTop: verticalScale(6),
    borderTopWidth: 1, borderTopColor: '#f2f2f2',
  },
  expandText: { fontSize: moderateScale(12), color: COLORS.AstroMaroon, fontWeight: 'bold' },
  details: { marginTop: verticalScale(6) },
  detailLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(4) },
  detailLineTitle: { flex: 1, fontSize: moderateScale(12), color: '#333' },
  detailLineQty: { fontSize: moderateScale(12), color: '#888', marginHorizontal: scale(8) },
  detailLineTotal: { fontSize: moderateScale(12), color: '#333', fontWeight: 'bold', minWidth: scale(50), textAlign: 'right' },
  feeBlock: { marginTop: verticalScale(8), borderTopWidth: 1, borderTopColor: '#f2f2f2', paddingTop: verticalScale(6) },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: verticalScale(2) },
  feeLabel: { fontSize: moderateScale(12), color: '#777' },
  feeValue: { fontSize: moderateScale(12), color: '#333' },
  feeLabelStrong: { fontSize: moderateScale(13), color: '#222', fontWeight: 'bold' },
  feeValueStrong: { fontSize: moderateScale(14), color: COLORS.AstroMaroon, fontWeight: 'bold' },
  addressBlock: { marginTop: verticalScale(12) },
  blockHeading: {
    fontSize: moderateScale(11), color: '#888', fontWeight: 'bold',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: verticalScale(12),
    marginBottom: verticalScale(4),
  },
  addressText: { fontSize: moderateScale(12), color: '#555', lineHeight: verticalScale(17) },
  timeline: { marginTop: verticalScale(2) },
  trackRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(4) },
  trackTextCol: { flex: 1, marginLeft: scale(8) },
  trackLabel: { fontSize: moderateScale(12), color: '#aaa' },
  trackLabelDone: { fontSize: moderateScale(12), color: '#333', fontWeight: 'bold' },
  trackNote: { fontSize: moderateScale(11), color: '#999' },
  trackTime: { fontSize: moderateScale(10), color: '#aaa' },
  cancelBtn: {
    borderWidth: 1, borderColor: COLORS.red, borderRadius: moderateScale(8),
    paddingVertical: verticalScale(9), alignItems: 'center', marginTop: verticalScale(14),
  },
  cancelBtnText: { color: COLORS.red, fontWeight: 'bold', fontSize: moderateScale(13) },

  emptyBox: { alignItems: 'center', paddingVertical: verticalScale(80) },
  emptyText: { fontSize: moderateScale(14), color: '#999', marginTop: verticalScale(12) },
  shopBtn: {
    backgroundColor: COLORS.AstroMaroon, borderRadius: moderateScale(10),
    paddingVertical: verticalScale(11), paddingHorizontal: scale(26), marginTop: verticalScale(18),
  },
  shopBtnText: { color: '#fff', fontWeight: 'bold', fontSize: moderateScale(14) },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    padding: scale(20),
    maxHeight: '75%',
  },
  modalTitle: { fontSize: moderateScale(18), fontWeight: 'bold', color: COLORS.AstroMaroon, marginBottom: verticalScale(12) },
  modalScroll: { marginBottom: verticalScale(16) },
  reportText: { fontSize: moderateScale(14), color: '#333', lineHeight: 22 },
  closeBtn: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(12),
    alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontWeight: 'bold', fontSize: moderateScale(15) },
});

export default MyOrdersScreen;
