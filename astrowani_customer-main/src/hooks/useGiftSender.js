// Shared gift-sending logic — used by both the GiftModal (Component/Modal.tsx,
// live + profile "gift" button) and the always-visible gift grid on the
// astrologer profile screen (AstrologerInfo.js), so the confirm-before-charge
// and insufficient-balance handling only lives in one place.
//
//   const { sendGift, sendingGiftId } = useGiftSender();
//   sendGift({ astrologerId, gift, context: 'profile', sessionId, onSent, onBalanceChange });
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, ToastAndroid, Alert } from 'react-native';
import Instance from '../api/ApiCall';
import { showStatusPopup } from '../components/StatusPopup';
import { captureEvent } from '../utils/Analytics';

const notify = (msg) =>
  Platform.OS === 'android' ? ToastAndroid.show(msg, ToastAndroid.SHORT) : Alert.alert(msg);

export default function useGiftSender() {
  const [sendingGiftId, setSendingGiftId] = useState(null);

  const showInsufficientBalancePopup = (gift) => {
    showStatusPopup({
      variant: 'insufficient',
      title: 'Insufficient Balance',
      message: `You need ₹${gift.price} to send "${gift.name}" but your wallet doesn't have enough. Please recharge and try again.`,
    });
  };

  const doSend = async ({ astrologerId, gift, context, sessionId, onSent, onBalanceChange }) => {
    setSendingGiftId(gift._id);
    // Generated once per tap and reused for this request only — lets the backend dedupe a
    // double-tap or network-layer retry of the SAME confirm as one charge, while a genuine
    // second gift (a new tap, later) gets its own id and is billed normally.
    const clientRequestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.post(
        '/api/gift/send',
        { astrologerId, giftId: gift._id, context, sessionId, clientRequestId },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data?.success) {
        // Real revenue, same as a recharge — worth its own event with the amount on it.
        captureEvent('gift_sent', {
          astrologer_id: astrologerId,
          gift_id: gift._id,
          gift_name: gift.name,
          price: gift.price,
          context,
        });
        onBalanceChange?.(res.data.newBalance);
        notify(`Gift sent: ${gift.name}`);
        onSent?.(gift);
      } else if ((res.data?.message || '').toLowerCase().includes('insufficient')) {
        captureEvent('gift_failed', { astrologer_id: astrologerId, gift_id: gift._id, price: gift.price, context, reason: 'low_balance' });
        showInsufficientBalancePopup(gift);
      } else {
        captureEvent('gift_failed', { astrologer_id: astrologerId, gift_id: gift._id, price: gift.price, context, reason: 'rejected' });
        notify(res.data?.message || 'Could not send gift');
      }
    } catch (e) {
      const msg = e?.response?.data?.message || 'Could not send gift';
      captureEvent('gift_failed', {
        astrologer_id: astrologerId,
        gift_id: gift._id,
        price: gift.price,
        context,
        reason: msg.toLowerCase().includes('insufficient') ? 'low_balance' : 'error',
      });
      if (msg.toLowerCase().includes('insufficient')) {
        showInsufficientBalancePopup(gift);
      } else {
        notify(msg);
      }
    } finally {
      setSendingGiftId(null);
    }
  };

  // Re-checks a FRESH wallet balance right before showing the confirm popup — never
  // trusts a balance fetched earlier (e.g. when a modal/screen first opened), so both
  // the insufficient-balance gate and the amount the user confirms are always current.
  const sendGift = async ({ astrologerId, gift, context = 'profile', sessionId, onSent, onBalanceChange }) => {
    if (!gift || !astrologerId) return;
    // null (not 0) when the fetch itself fails — 0 would wrongly look like "insufficient"
    // for every gift regardless of the real balance. On a failed fetch, skip this
    // client-side gate entirely rather than block on missing information; the backend's
    // own authoritative balance check (in doSend, below) is still the real enforcement.
    let freshBalance = null;
    try {
      const token = await AsyncStorage.getItem('token');
      const walletRes = await Instance.get('/api/wallet', { headers: { Authorization: `Bearer ${token}` } });
      freshBalance = walletRes.data?.data?.balance ?? null;
      if (freshBalance != null) onBalanceChange?.(freshBalance);
    } catch (e) {
      console.log('[useGiftSender] wallet balance fetch failed:', e?.message);
    }

    captureEvent('gift_tapped', { astrologer_id: astrologerId, gift_id: gift._id, price: gift.price, context });

    if (freshBalance != null && freshBalance < gift.price) {
      captureEvent('gift_blocked', { astrologer_id: astrologerId, gift_id: gift._id, price: gift.price, context, reason: 'low_balance', balance: freshBalance });
      showInsufficientBalancePopup(gift);
      return;
    }

    showStatusPopup({
      variant: 'confirmPay',
      title: 'Confirm Gift',
      message: `₹${gift.price} will be debited from your wallet to send "${gift.name}".`,
      confirmText: `Pay ₹${gift.price}`,
      cancelText: 'Cancel',
      onConfirm: () => doSend({ astrologerId, gift, context, sessionId, onSent, onBalanceChange }),
      onCancel: () => captureEvent('gift_declined', { astrologer_id: astrologerId, gift_id: gift._id, price: gift.price, context }),
    });
  };

  return { sendGift, sendingGiftId };
}
