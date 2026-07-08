// Shared purchase flow for the 10 paid astro report screens: loads the service's price,
// checks wallet balance before submitting (mirrors the AstrologerInfo.js / GiftModal pattern —
// Alert on insufficient balance, no dedicated recharge screen exists in this app), then calls
// the report endpoint. Returns the report payload on success, null on any failure (screen just
// checks truthiness before navigating).
import {useEffect, useState} from 'react';
import {Alert} from 'react-native';
import {getAstroServices, getWalletBalance, runAstroReport} from '../../../api/astroApi';

export default function useAstroPurchase(serviceKey) {
  const [service, setService] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    getAstroServices()
      .then((list) => {
        if (mounted) setService(list.find((s) => s.key === serviceKey) || null);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [serviceKey]);

  async function submit(payload) {
    if (!service) {
      Alert.alert('Not available', 'This report is not available right now. Please try again later.');
      return null;
    }
    setSubmitting(true);
    try {
      const balance = await getWalletBalance();
      if (balance < service.price) {
        Alert.alert(
          'Insufficient Balance',
          `This report costs ₹${service.price}. Your wallet balance is ₹${balance}. Please recharge your wallet.`,
        );
        return null;
      }
      return await runAstroReport(serviceKey, payload);
    } catch (err) {
      if (err.isInsufficientBalance) {
        Alert.alert('Insufficient Balance', 'Please recharge your wallet to get this report.');
      } else {
        Alert.alert('Error', err.message || 'Failed to generate report');
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  return {service, submitting, submit};
}
