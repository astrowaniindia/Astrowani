import React, { useState, useCallback, useContext } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Modal, TextInput, Alert, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';

const STATUS_COLORS = {
  pending: '#F5A623',
  approved: '#2196F3',
  paid: '#4CAF50',
  rejected: '#D32F2F',
};

// Same icon language as SessionHistory.js so a vendor sees the same call-type visuals in
// both places — a "Chat with Ansh Sharma" row here should look like the chat tab there.
const CALL_TYPE_ICONS = {
  chat: { name: 'chatbubble', color: '#5C6BC0', label: 'Chat' },
  audio: { name: 'call', color: '#2E7D32', label: 'Call' },
  voice: { name: 'call', color: '#2E7D32', label: 'Call' },
  video: { name: 'videocam', color: '#6A1B9A', label: 'Video call' },
};

// Exact date AND time — the vague date-only stamp this replaced was the #1 complaint
// ("not the exact time was written, I was very confused when did I get this amount").
const formatDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

export default function Wallet() {
  const navigation = useNavigation();
  const { t } = useContext(LanguageContext);
  const [balance, setBalance] = useState(null);
  const [hasPayoutDetails, setHasPayoutDetails] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Recent Transactions used to sit BELOW the entire Withdrawal Requests list — with
  // enough withdrawal history that pushed it far down the screen, hard to find (reported
  // 2026-08-08). Split into tabs so each list gets its own dedicated scroll area instead
  // of competing for space in one long column.
  const [activeTab, setActiveTab] = useState('transactions');

  const fetchWallet = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      // Via the backend, not direct `astrologers`/`vendor_wallet_transactions` reads —
      // neither is in the anon grant (bank details and wallet_balance are excluded from
      // astrologers' SELECT grant; vendor_wallet_transactions gets no grant at all). See
      // DATABASE_HARDENING_HANDOFF.md §3.1/§3.2.
      const walletRes = await Instance.get('/api/vendor/wallet', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (walletRes.data?.success) {
        const w = walletRes.data.data;
        setBalance(w.wallet_balance ?? 0);
        const hasBank = w.bank_account_holder && w.bank_account_number && w.bank_ifsc;
        setHasPayoutDetails(!!(hasBank || w.upi_id));
        setTransactions((w.transactions || []).map(t => ({
          id: t.id,
          description: t.description || 'Consultation Earning',
          isCredit: t.type === 'credit',
          amount: t.amount,
          dateTime: formatDateTime(t.created_at),
          customerName: t.customerName || null,
          callType: t.callType || null,
        })));
      }

      // Withdrawal request status history
      try {
        const res = await Instance.get('/vendor/wallet/withdrawals', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data?.success) setWithdrawals(res.data.data || []);
      } catch (e) {
        console.warn('Withdrawal history fetch error', e);
      }
    } catch (e) {
      console.warn('Wallet fetch error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchWallet();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchWallet();
  };

  const openWithdrawModal = () => {
    if (!hasPayoutDetails) {
      Alert.alert(
        'Payout Details Required',
        'Please add your bank account or UPI ID in Edit Profile before requesting a withdrawal.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Edit Profile', onPress: () => navigation.navigate('EditProfile') },
        ]
      );
      return;
    }
    setAmount('');
    setModalVisible(true);
  };

  const submitWithdrawal = async () => {
    const value = Number(amount);
    if (!value || value <= 0) {
      Alert.alert('Enter a valid amount');
      return;
    }
    if (value > (balance ?? 0)) {
      Alert.alert('Amount exceeds your wallet balance');
      return;
    }
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.post(
        '/vendor/wallet/withdraw',
        { amount: value },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.success) {
        setModalVisible(false);
        Alert.alert('Withdrawal requested', 'Your request has been submitted and is pending admin approval.');
        fetchWallet();
      } else {
        Alert.alert('Unable to request withdrawal', res.data?.message || 'Please try again.');
      }
    } catch (e) {
      Alert.alert('Unable to request withdrawal', e.response?.data?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderWithdrawal = ({ item: w }) => (
    <View style={styles.withdrawalCard}>
      <View style={styles.withdrawalRow}>
        <Text style={styles.withdrawalAmount}>₹{w.amount}</Text>
        <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[w.status] || '#999' }]}>
          <Text style={styles.statusPillText}>{w.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.transactionDate}>
        {t('wallet.requested')} {new Date(w.requested_at).toLocaleDateString('en-IN')}
      </Text>
      {w.admin_note ? <Text style={styles.withdrawalNote}>{w.admin_note}</Text> : null}
    </View>
  );

  const renderTransaction = ({ item }) => {
    const typeIcon = CALL_TYPE_ICONS[item.callType] || null;
    // A real session earning reads "Chat with Ansh Sharma" instead of the generic
    // "Automated chat earning". Gifts have a customerName but no callType/typeIcon (a gift
    // isn't a call/chat/video session) — this used to require BOTH, so a gift's sender name
    // was silently dropped even once the backend started resolving it; falls back to the
    // raw description only when there's truly no customer to attribute it to (withdrawals,
    // refunds, admin corrections).
    const title = item.customerName
      ? (typeIcon ? `${typeIcon.label} with ${item.customerName}` : `${item.description} from ${item.customerName}`)
      : item.description;
    const icon = typeIcon || (item.isCredit
      ? { name: 'add-circle', color: '#2E7D32' }
      : { name: 'remove-circle', color: '#D32F2F' });

    return (
      <View style={[styles.transactionCard, { borderLeftColor: icon.color }]}>
        <View style={[styles.transactionIconBadge, { backgroundColor: icon.color + '18' }]}>
          <Ionicons name={icon.name} size={18} color={icon.color} />
        </View>
        <View style={styles.transactionTextCol}>
          <Text style={styles.transactionDescription} numberOfLines={1}>{title}</Text>
          <Text style={styles.transactionDate}>{item.dateTime}</Text>
        </View>
        <Text style={[styles.transactionAmount, { color: item.isCredit ? '#2E7D32' : '#D32F2F' }]}>
          {item.isCredit ? `+₹${item.amount}` : `-₹${item.amount}`}
        </Text>
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

  const activeList = activeTab === 'transactions' ? transactions : withdrawals;

  return (
    <View style={styles.container}>
      <FlatList
        data={activeList}
        keyExtractor={(item) => item.id}
        renderItem={activeTab === 'transactions' ? renderTransaction : renderWithdrawal}
        contentContainerStyle={styles.transactionList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.AstroMaroon]} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {activeTab === 'transactions' ? t('wallet.noTransactions') : t('wallet.noWithdrawals')}
          </Text>
        }
        ListHeaderComponent={
          <>
            {/* Wallet Balance Section */}
            <View style={styles.walletCard}>
              <Text style={styles.walletText}>{t('wallet.walletBalance')}</Text>
              <Text style={styles.walletBalance}>₹{balance}</Text>
              <TouchableOpacity style={styles.topUpButton} onPress={openWithdrawModal}>
                <Text style={styles.topUpButtonText}>{t('wallet.requestWithdrawal')}</Text>
              </TouchableOpacity>
            </View>

            {/* Each list gets its own tab instead of stacking in one column, so a long
                withdrawal history can never bury Recent Transactions (or vice versa). */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'transactions' && styles.tabItemActive]}
                onPress={() => setActiveTab('transactions')}
                activeOpacity={0.75}>
                <Text style={[styles.tabLabel, activeTab === 'transactions' && styles.tabLabelActive]}>
                  {t('wallet.transactions')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'withdrawals' && styles.tabItemActive]}
                onPress={() => setActiveTab('withdrawals')}
                activeOpacity={0.75}>
                <Text style={[styles.tabLabel, activeTab === 'withdrawals' && styles.tabLabelActive]}>
                  {t('wallet.withdrawals')}{withdrawals.length ? ` (${withdrawals.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        }
      />

      <Modal transparent visible={modalVisible} animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('wallet.requestWithdrawal')}</Text>
            <Text style={styles.modalSubtitle}>{t('wallet.walletBalance')}: ₹{balance}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter amount"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={submitWithdrawal}
                disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>{t('common.submit')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  topUpButtonText: { fontSize: 16, color: '#4CAF50', fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 14,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: COLORS.AstroMaroon,
  },
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#888' },
  tabLabelActive: { color: '#fff' },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 14, marginTop: 30 },
  transactionList: { paddingBottom: 20 },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionTextCol: { flex: 1 },
  transactionDescription: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  transactionAmount: { fontSize: 16, fontWeight: 'bold' },
  transactionDate: { fontSize: 12, color: '#888', marginTop: 2 },
  withdrawalCard: {
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
  withdrawalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  withdrawalAmount: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusPillText: { fontSize: 11, fontWeight: 'bold', color: '#FFF' },
  withdrawalNote: { fontSize: 13, color: '#D32F2F', marginTop: 6, fontStyle: 'italic' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '85%',
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: '#777', marginBottom: 16 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalCancelButton: { paddingVertical: 10, paddingHorizontal: 16, marginRight: 8 },
  modalCancelText: { color: '#777', fontSize: 15 },
  modalSubmitButton: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  modalSubmitText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
