// GiftModal — real, wallet-connected gifting (live + profile).
import React, {useEffect, useRef, useState} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';
import {COLORS} from '../Theme/Colors';
import useGiftSender from '../hooks/useGiftSender';
import {useModalPresence} from '../utils/modalPresentation';
import {captureEvent} from '../utils/Analytics';

export default function GiftModal({visible, onClose, astrologer, context = 'profile', sessionId}: any) {
  const [gifts, setGifts] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  // Validation messages render INSIDE this modal rather than through Alert.
  // App.js overrides Alert.alert to render CustomAlert, which is itself a
  // <Modal> mounted at the app root — see the iOS note on send() below.
  const [notice, setNotice] = useState('');
  const pendingSendRef = useRef<null | (() => void)>(null);
  const {sendGift, sendingGiftId} = useGiftSender();
  // Declares this modal to the presentation registry so root-level popups
  // (StatusPopup / CustomAlert / ...) wait for it instead of colliding with
  // it on iOS. See utils/modalPresentation.
  useModalPresence(visible);
  const sending = !!sendingGiftId;

  const astrologerId = astrologer?.userId || astrologer?._id;

  // Opening the gift sheet, as opposed to actually sending one (gift_tapped /
  // gift_sent, both fired inside useGiftSender). Browse-to-send is the interesting
  // ratio here.
  useEffect(() => {
    if (visible) captureEvent('gift_modal_opened', {astrologer_id: astrologerId, context});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const load = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = {Authorization: `Bearer ${token}`};
      const [giftRes, walletRes] = await Promise.all([
        Instance.get('/api/gifts', {headers}),
        Instance.get('/api/wallet', {headers}),
      ]);
      setGifts(giftRes.data?.data || []);
      setBalance(walletRes.data?.data?.balance ?? 0);
    } catch (e) {
      console.log('GiftModal load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) { setSelected(null); setNotice(''); load(); }
  }, [visible]);

  // Confirm-before-charge + insufficient-balance handling lives in useGiftSender
  // (shared with the always-visible gift grid on the astrologer profile screen).
  const runSend = () => {
    sendGift({
      astrologerId,
      gift: selected,
      context,
      sessionId,
      onBalanceChange: (b) => setBalance(b ?? balance),
      onSent: () => { onClose && onClose(); },
    });
  };

  const send = () => {
    if (!selected) { setNotice('Select a gift first'); return; }
    if (!astrologerId) { setNotice('Astrologer info missing'); return; }
    setNotice('');

    // iOS presents every <Modal> as a real view controller, and you cannot
    // present onto one that is already presenting. useGiftSender's confirm
    // popup (showStatusPopup) is a <Modal> mounted at the NAVIGATION root —
    // i.e. underneath this one — so on iOS that presentation silently fails
    // and leaves an invisible modal holding all touch input: the app looks
    // frozen (video keeps playing, no button responds) and the gift never
    // sends. Android stacks modals as plain views in one window, which is why
    // this only ever broke on iOS.
    // So: dismiss this modal FIRST and fire the confirm from onDismiss, once
    // the presentation is genuinely free.
    if (Platform.OS === 'ios') {
      pendingSendRef.current = runSend;
      onClose && onClose();
      return;
    }
    runSend();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      // iOS-only; fires after the dismissal animation completes.
      onDismiss={() => {
        const pending = pendingSendRef.current;
        pendingSendRef.current = null;
        pending && pending();
      }}>
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <View style={styles.handle} />
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.balanceLabel}>Wallet Balance</Text>
              <Text style={styles.balance}>₹{balance}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                captureEvent('gift_modal_closed', {astrologer_id: astrologerId, context, had_selection: !!selected});
                if (onClose) onClose();
              }}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={COLORS.AstroMaroon} style={{marginVertical: 30}} />
          ) : (
            <FlatList
              data={gifts}
              numColumns={4}
              keyExtractor={item => String(item._id)}
              contentContainerStyle={{paddingVertical: 8}}
              ListEmptyComponent={<Text style={styles.empty}>No gifts available.</Text>}
              renderItem={({item}) => {
                const isSel = selected?._id === item._id;
                return (
                  <TouchableOpacity
                    style={[styles.giftItem, isSel && styles.giftItemSelected]}
                    onPress={() => {
                      captureEvent('gift_selected', {astrologer_id: astrologerId, context, gift_id: item?._id, price: item?.price});
                      setSelected(item);
                    }}>
                    <Image source={{uri: item.image}} style={styles.giftImage} />
                    <Text style={styles.giftName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.price}>₹{item.price}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {!!notice && <Text style={styles.notice}>{notice}</Text>}

          <TouchableOpacity style={[styles.sendBtn, (!selected || sending) && {opacity: 0.6}]} onPress={send} disabled={!selected || sending}>
            <Text style={styles.sendText}>
              {sending ? 'Sending…' : selected ? `Send ${selected.name} · ₹${selected.price}` : 'Select a gift'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 16, minHeight: '52%', maxHeight: '80%',
  },
  handle: {alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#ddd', marginBottom: 12},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
  balanceLabel: {fontSize: 12, color: '#888'},
  balance: {fontSize: 24, fontWeight: 'bold', color: COLORS.AstroMaroon},
  closeBtn: {backgroundColor: '#eee', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20},
  closeText: {color: COLORS.AstroMaroon, fontWeight: '600'},
  giftItem: {flex: 1 / 4, alignItems: 'center', margin: 6, padding: 8, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent'},
  giftItemSelected: {borderColor: COLORS.AstroGold, backgroundColor: 'rgba(212,160,23,0.12)'},
  giftImage: {width: 48, height: 48, borderRadius: 10},
  giftName: {fontSize: 11, color: '#444', marginTop: 4},
  price: {fontSize: 12, color: COLORS.AstroMaroon, fontWeight: 'bold', marginTop: 2},
  empty: {textAlign: 'center', color: '#888', marginVertical: 24, width: '100%'},
  notice: {textAlign: 'center', color: '#C0392B', fontSize: 13, marginTop: 8},
  sendBtn: {backgroundColor: COLORS.AstroMaroon, paddingVertical: 14, borderRadius: 26, marginTop: 12},
  sendText: {color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 16},
});
