import React, { useState, useEffect, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import { supabase } from '../../api/SupabaseClient';
import ExpertsList from '../component/ExpertsList';

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

  // Live sync — re-fetch when any astrologer row changes (unique channel per mount).
  useEffect(() => {
    const channel = supabase
      .channel(`category-astro-${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'astrologers' },
        () => fetchAstrologers(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAstrologers]);

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
