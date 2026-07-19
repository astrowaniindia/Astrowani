import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

const TYPE_LABEL = { puja: 'Puja', gemstone: 'Gemstone', specific_puja: 'Specific Puja', life_report: 'Life Report' };

function statusColor(status) {
  if (status === 'completed') return '#4CAF50';
  if (status === 'cancelled') return '#D32F2F';
  return '#F5A623';
}

const MyOrdersScreen = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewingReport, setViewingReport] = useState(null);

  const fetchOrders = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.get('/api/orders/mine', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) setOrders(res.data.data || []);
    } catch (e) {
      console.warn('Orders fetch error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [])
  );

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={item.report_content ? 0.7 : 1}
      onPress={() => item.report_content && setViewingReport(item)}>
      <View style={styles.cardHeader}>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.item_title}</Text>
        <View style={[styles.statusPill, { backgroundColor: statusColor(item.status) }]}>
          <Text style={styles.statusPillText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.itemMeta}>{TYPE_LABEL[item.item_type] || item.item_type} · ₹{item.total}</Text>
      <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleDateString('en-IN')}</Text>
      {item.item_type === 'life_report' && (
        item.report_content ? (
          <View style={styles.reportReadyRow}>
            <Icon name="description" size={16} color={COLORS.AstroMaroon} />
            <Text style={styles.reportReadyText}>Report delivered — tap to view</Text>
          </View>
        ) : (
          <Text style={styles.reportPendingText}>Your report is being prepared…</Text>
        )
      )}
    </TouchableOpacity>
  );

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
            <Text style={styles.emptyText}>No orders yet.</Text>
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
              <Text style={styles.closeBtnText}>Close</Text>
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
  itemMeta: { fontSize: moderateScale(13), color: '#777', marginBottom: 2 },
  itemDate: { fontSize: moderateScale(11), color: '#aaa' },
  reportReadyRow: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(8) },
  reportReadyText: { fontSize: moderateScale(13), color: COLORS.AstroMaroon, fontWeight: '600', marginLeft: 6 },
  reportPendingText: { fontSize: moderateScale(12), color: '#999', marginTop: verticalScale(8), fontStyle: 'italic' },
  emptyBox: { alignItems: 'center', paddingVertical: verticalScale(80) },
  emptyText: { fontSize: moderateScale(14), color: '#999', marginTop: verticalScale(12) },
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
