import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { supabase } from '../../api/SupabaseClient';

export default function Wallet() {
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchWallet = async () => {
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;

      // 1. Fetch balance
      const { data: astroData, error: astroErr } = await supabase
        .from('astrologers')
        .select('wallet_balance')
        .eq('id', astroId)
        .single();
      
      if (!astroErr && astroData) {
        setBalance(astroData.wallet_balance ?? 0);
      }

      // 2. Fetch transactions
      const { data: txns, error: txnErr } = await supabase
        .from('vendor_wallet_transactions')
        .select('*')
        .eq('vendor_id', astroId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!txnErr && txns) {
        setTransactions(txns.map(t => ({
          id: t.id,
          description: t.description || 'Consultation Earning',
          amount: t.type === 'credit' ? t.amount : -t.amount,
          date: new Date(t.created_at).toLocaleDateString('en-IN'),
        })));
      }
    } catch (e) {
      console.warn('Wallet fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchWallet();
    }, [])
  );

  const renderTransaction = ({ item }) => (
    <View style={styles.transactionCard}>
      <Text style={styles.transactionDescription}>{item.description}</Text>
      <Text style={styles.transactionAmount}>
        {item.amount > 0 ? `+₹${item.amount}` : `-₹${Math.abs(item.amount)}`}
      </Text>
      <Text style={styles.transactionDate}>{item.date}</Text>
    </View>
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
      {/* Wallet Balance Section */}
      <View style={styles.walletCard}>
        <Text style={styles.walletText}>Wallet Balance</Text>
        <Text style={styles.walletBalance}>₹{balance}</Text>
        <TouchableOpacity style={styles.topUpButton} onPress={() => {}}>
          <Text style={styles.topUpButtonText}>Top Up</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Transactions Section */}
      <Text style={styles.sectionTitle}>Recent Transactions</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransaction}
        contentContainerStyle={styles.transactionList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', padding: 16 },
  containerCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  walletCard: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  walletText: { fontSize: 16, color: '#FFF', marginBottom: 8 },
  walletBalance: { fontSize: 36, fontWeight: 'bold', color: '#FFF', marginBottom: 16 },
  topUpButton: { backgroundColor: '#FFF', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5 },
  topUpButtonText: { fontSize: 16, color: '#4CAF5' /* intentionally left as placeholder for quick fix */ },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  transactionList: { paddingBottom: 20 },
  transactionCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionDescription: { fontSize: 16, color: '#333', marginBottom: 4 },
  transactionAmount: { fontSize: 18, fontWeight: 'bold', color: '#4CAF50', marginBottom: 4 },
  transactionDate: { fontSize: 14, color: '#777' },
});
