import React, { useState, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import ExpertsList from '../component/ExpertsList';
import useAstrologerListSync from '../../hooks/useAstrologerListSync';

// Lists astrologers belonging to one category (e.g. Vedic Astrology, Tarot Reading,
// Numerology, Palmistry). The category is whatever the vendor picked at signup
// (stored as a category id in astrologers.specialties); the backend filters via
// /api/astrologers?category=<id|name>. Uses the shared 3-button ExpertsList card.
const CategoryAstrologers = ({ route }) => {
  const { categoryId, categoryName } = route.params || {};
  const [astrologers, setAstrologers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAstrologers = useCallback(async () => {
    try {
      // Prefer filtering by id; fall back to name. Backend matches either.
      const param = encodeURIComponent(categoryId || categoryName || '');
      const response = await Instance.get(`/api/astrologers?category=${param}`);
      setAstrologers(response?.data?.data || []);
    } catch (err) {
      console.log('CategoryAstrologers fetch error:', err?.message);
      setAstrologers([]);
    } finally {
      setLoading(false);
    }
  }, [categoryId, categoryName]);

  useFocusEffect(
    useCallback(() => {
      fetchAstrologers();
    }, [fetchAstrologers]),
  );

  // Live sync — via the backend's single coalesced broadcast (see
  // hooks/useAstrologerListSync.js) instead of this screen's own direct, unfiltered
  // Supabase Realtime subscription — that pattern scales Realtime connections and
  // refetch storms as users x screens, which is exactly what broke at volume.
  useAstrologerListSync(fetchAstrologers);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAstrologers();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ExpertsList data={astrologers} refreshing={refreshing} onRefresh={onRefresh} />
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.AstroSoftOrange },
});

export default CategoryAstrologers;
