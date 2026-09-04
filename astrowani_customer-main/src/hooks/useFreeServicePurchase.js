// Confirm-before-pay flow for the Home screen's Free Services cards — each visit now costs a
// flat ₹1 (see api/freeServicesApi.js + backend freeServicesRoutes.js POST
// /api/free-services/charge). Mirrors drawerScreens/AstroServices/useAstroPurchase.js's
// balance-check -> confirm popup -> charge shape, but the "product" here is access to the
// screen for this visit, not a single API payload, so there's no `submit(payload)` — just
// purchase(serviceKey, serviceName) that resolves true (go ahead and navigate) or false
// (insufficient balance / user cancelled / charge failed — all already surfaced via popup).
import {useContext, useState} from 'react';
import {getWalletBalance} from '../utils/wallet';
import {chargeFreeService} from '../api/freeServicesApi';
import {LanguageContext} from '../context/LanguageContext';
import {showStatusPopup} from '../components/StatusPopup';
import {captureEvent} from '../utils/Analytics';

const FREE_SERVICE_PRICE = 1;

export default function useFreeServicePurchase() {
  const {t} = useContext(LanguageContext);
  const [charging, setCharging] = useState(false);

  async function purchase(serviceKey, serviceName) {
    captureEvent('free_service_tapped', {service_key: serviceKey});
    setCharging(true);
    try {
      const balance = await getWalletBalance();
      if (balance < FREE_SERVICE_PRICE) {
        captureEvent('free_service_blocked', {service_key: serviceKey, reason: 'low_balance', balance});
        showStatusPopup({
          variant: 'insufficient',
          title: t('alerts.insufficientBalance'),
          message: t('freeServices.costMsg', {price: FREE_SERVICE_PRICE, balance}),
        });
        return false;
      }

      const confirmed = await new Promise((resolve) => {
        showStatusPopup({
          variant: 'confirmPay',
          title: t('astro.confirmPurchase'),
          message: t('freeServices.confirmMsg', {price: FREE_SERVICE_PRICE, name: serviceName}),
          confirmText: t('astro.payAmount', {price: FREE_SERVICE_PRICE}),
          cancelText: t('common.cancel'),
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) {
        captureEvent('free_service_declined', {service_key: serviceKey, price: FREE_SERVICE_PRICE});
        return false;
      }

      const requestId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      await chargeFreeService(serviceKey, requestId);
      captureEvent('free_service_purchased', {service_key: serviceKey, price: FREE_SERVICE_PRICE});
      return true;
    } catch (err) {
      captureEvent('free_service_failed', {
        service_key: serviceKey,
        reason: err.isInsufficientBalance ? 'low_balance' : (err.code || 'other'),
      });
      if (err.isInsufficientBalance) {
        showStatusPopup({
          variant: 'insufficient',
          title: t('alerts.insufficientBalance'),
          message: t('astro.rechargeToView'),
        });
      } else {
        showStatusPopup({
          variant: 'info',
          title: t('common.error'),
          message: err.message || t('freeServices.failedToCharge'),
        });
      }
      return false;
    } finally {
      setCharging(false);
    }
  }

  return {charging, purchase};
}
