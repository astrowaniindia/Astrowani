import React, {useState, useCallback} from 'react';
import {StyleSheet, Text, TouchableOpacity, View, FlatList, ActivityIndicator, RefreshControl} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Instance from '../../../api/ApiCall';
import {COLORS} from '../../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';

const History = ({navigation}) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTransactions = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await Instance.get('/api/wallet', {
        headers: {Authorization: `Bearer ${token}`},
      });
      if (res.data?.success) setTransactions(res.data.data.transactions || []);
    } catch (e) {
      console.warn('History fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransactions();
  };

  const renderTransaction = ({item}) => (
    <View style={styles.transactionCard}>
      <Text style={styles.transactionDescription}>{item.description}</Text>
      <Text style={[styles.transactionAmount, item.amount < 0 && styles.transactionAmountDebit]}>
        {item.amount > 0 ? `+₹${item.amount}` : `-₹${Math.abs(item.amount)}`}
      </Text>
      <Text style={styles.transactionDate}>{item.date}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <FlatList
      data={transactions}
      keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
      renderItem={renderTransaction}
      contentContainerStyle={transactions.length ? styles.list : styles.emptyList}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.AstroMaroon]} />
      }
      ListEmptyComponent={
        <View style={styles.container}>
          <Icon name="history" size={50} color={COLORS.AstroMaroon} style={styles.icon} />
          <Text style={styles.noTransactionText}>No Transaction</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.addMoneyButton}>
            <Text style={styles.addMoneyText}>Add Money</Text>
          </TouchableOpacity>
        </View>
      }
    />
  );
};

export default History;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  list: {padding: scale(16), paddingBottom: verticalScale(30)},
  emptyList: {flexGrow: 1, justifyContent: 'center', alignItems: 'center'},
  icon: {
    marginBottom: 10,
  },
  noTransactionText: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: '#333',
    marginBottom: verticalScale(15),
  },
  addMoneyButton: {
    backgroundColor: '#800000',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(25),
  },
  addMoneyText: {
    color: '#fff',
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
  },
  transactionCard: {
    backgroundColor: '#FFF',
    borderRadius: moderateScale(8),
    padding: scale(16),
    marginBottom: verticalScale(10),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  transactionDescription: {fontSize: moderateScale(15), color: '#333', marginBottom: 4, fontFamily: 'Lato-Regular'},
  transactionAmount: {fontSize: moderateScale(17), fontFamily: 'Lato-Bold', color: '#2e7d32', marginBottom: 4},
  transactionAmountDebit: {color: '#c0392b'},
  transactionDate: {fontSize: moderateScale(12), color: '#777'},
});
