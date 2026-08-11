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

const FREE_SERVICE_PRICE = 1;

export default function useFreeServicePurchase() {
  const {t} = useContext(LanguageContext);
  const [charging, setCharging] = useState(false);

  async function purchase(serviceKey, serviceName) {
    setCharging(true);
    try {
      const balance = await getWalletBalance();
      if (balance < FREE_SERVICE_PRICE) {
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
      if (!confirmed) return false;

      const requestId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      await chargeFreeService(serviceKey, requestId);
      return true;
    } catch (err) {
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
