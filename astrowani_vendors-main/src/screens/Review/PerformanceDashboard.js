import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

function formatResponseTime(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

export default function PerformanceDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.get('/vendor/performance', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) setMetrics(res.data.data);
    } catch (e) {
      console.warn('Performance fetch error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchMetrics();
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.containerCenter}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  const hasData = metrics && metrics.resolvedRequests > 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchMetrics(true)} />}>
      <Text style={styles.title}>Your Performance</Text>
      <Text style={styles.subtitle}>
        How you look to customers — based on your last {metrics?.resolvedRequests ?? 0} requests.
      </Text>

      {!hasData ? (
        <View style={styles.emptyCard}>
          <Icon name="insights" size={40} color="#ccc" />
          <Text style={styles.emptyText}>Not enough activity yet to show your performance.</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.cardIconWrap}>
              <Icon name="bolt" size={26} color={COLORS.AstroGold} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardLabel}>Avg. Response Time</Text>
              <Text style={styles.cardValue}>{formatResponseTime(metrics.avgResponseSeconds)}</Text>
              <Text style={styles.cardHint}>How fast you accept or reject incoming requests</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardIconWrap}>
              <Icon name="check-circle" size={26} color="#4CAF50" />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardLabel}>Acceptance Rate</Text>
              <Text style={styles.cardValue}>{metrics.acceptanceRate ?? 0}%</Text>
              <Text style={styles.cardHint}>Of requests you've accepted, rejected, or missed</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardIconWrap}>
              <Icon name="favorite" size={26} color="#E91E63" />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardLabel}>Repeat Customers</Text>
              <Text style={styles.cardValue}>{metrics.repeatCustomerRate ?? 0}%</Text>
              <Text style={styles.cardHint}>
                Of your {metrics.totalCustomers} customer{metrics.totalCustomers === 1 ? '' : 's'}, how many came back
              </Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', padding: scale(16) },
  containerCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: moderateScale(20), fontWeight: 'bold', color: COLORS.AstroMaroon, marginBottom: verticalScale(4) },
  subtitle: { fontSize: moderateScale(13), color: '#777', marginBottom: verticalScale(20) },
  card: {
    backgroundColor: '#FFF',
    borderRadius: moderateScale(12),
    padding: scale(16),
    marginBottom: verticalScale(14),
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardIconWrap: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(14),
  },
  cardBody: { flex: 1 },
  cardLabel: { fontSize: moderateScale(13), color: '#888', marginBottom: 2 },
  cardValue: { fontSize: moderateScale(22), fontWeight: 'bold', color: '#222', marginBottom: 4 },
  cardHint: { fontSize: moderateScale(11), color: '#aaa' },
  emptyCard: { alignItems: 'center', paddingVertical: verticalScale(60) },
  emptyText: { fontSize: moderateScale(14), color: '#999', marginTop: verticalScale(12), textAlign: 'center' },
});
