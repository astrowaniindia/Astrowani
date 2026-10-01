import React, {useState, useRef, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  InputAccessoryView,
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import SwipeToConfirm from '../../../components/SwipeToConfirm';
import { describeRazorpayError } from '../../../utils/razorpayError';
import { showStatusPopup } from '../../../components/StatusPopup';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import { COLORS } from '../../../Theme/Colors';
import { LanguageContext } from '../../../context/LanguageContext';
import { SOCKET_URL } from '../../../config/api';
import { captureEvent } from '../../../utils/Analytics';
import { razorpayPrefill } from '../../../utils/customerIdentity';

// Real card/wallet network marks only -- FontAwesome5's bundled Brands font has
// genuine Visa/Mastercard/Google Pay glyphs (single-color simplified renditions, not
// the full official multi-color logo artwork, but the standard way apps show "these
// payment methods are accepted"). UPI has no logo asset anywhere in this project or
// any bundled font, so it is the plain word "UPI" -- a label, not a fabricated logo.
const TRUST_BADGES = [
  { key: 'visa', kind: 'icon', name: 'cc-visa', color: '#1A1F71' },
  { key: 'mastercard', kind: 'icon', name: 'cc-mastercard', color: '#EB001B' },
  { key: 'gpay', kind: 'icon', name: 'google-pay', color: '#4285F4' },
  { key: 'amex', kind: 'icon', name: 'cc-amex', color: '#006FCF' },
  { key: 'paypal', kind: 'icon', name: 'cc-paypal', color: '#003087' },
  { key: 'upi', kind: 'text', label: 'UPI', color: COLORS.AstroMaroon },
  // Trailing "+ more" -- Razorpay's own checkout sheet supports netbanking,
  // wallets and every major bank beyond what fits in six small circles here;
  // this says so honestly without naming a specific count we cannot guarantee.
  { key: 'more', kind: 'more' },
];

// Auspicious "ending in 1" amounts (shagun-style -- ₹51, ₹101, ₹501... is the
// culturally familiar gifting pattern), replacing the plain round numbers.
const presetAmounts = [51, 101, 251, 501, 1001, 2001];

const EDGE_FADE_W = scale(28);

// Stepped opacity bands approximating a left-to-right fade, each the page's own
// background colour (#F8F9FA) at increasing opacity. Plain Views rather than an
// SVG gradient: an absolutely-positioned (top:0/bottom:0, no explicit height)
// parent is exactly the case where react-native-svg's percentage-height canvas
// has historically failed to resolve, rendering nothing -- a flat View's height
// stretches reliably in that same layout, with no such edge case.
const FADE_BANDS = [0.08, 0.22, 0.4, 0.62, 0.85, 1];

/**
 * A soft right-edge fade over a horizontally-scrollable row, so the last chip
 * being cut off at the screen edge reads as "swipe for more" rather than as a
 * rendering glitch.
 */
function EdgeFade() {
  const bandW = EDGE_FADE_W / FADE_BANDS.length;
  return (
    <View pointerEvents="none" style={styles.edgeFade}>
      {FADE_BANDS.map((o, i) => (
        <View
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: i * bandW,
            width: bandW + 1, // +1 so adjacent bands overlap, no hairline gaps
            backgroundColor: '#F8F9FA',
            opacity: o,
          }}
        />
      ))}
    </View>
  );
}

// iOS's number-pad has NO return key, so a numeric field there has no way to
// dismiss its own keyboard — the amount field would trap the user with Proceed
// hidden behind it. Android has the back button, which is why this only ever
// bit on iOS. Two escapes: a Done bar above the keypad, and tap-anywhere-else.
const AMOUNT_ACCESSORY_ID = 'walletAmountAccessory';

const Wallet = ({navigation, route}) => {
  const { t } = React.useContext(LanguageContext);
  // Arriving from the "not enough balance" popup: that popup already worked out a
  // top-up that covers the shortfall, so the amount is filled in for them.
  const suggestedAmount = Number(route?.params?.suggestedAmount) || 0;
  const [amount, setAmount] = useState(suggestedAmount > 0 ? String(suggestedAmount) : '');
  const [processing, setProcessing] = useState(false);

  // "Customer chose an amount" — one event per visit, however the amount arrived.
  // This used to fire ONLY when a preset chip was tapped, so anyone who typed their own
  // figure, or arrived from the low-balance popup with one already filled in, went
  // unrecorded: the recharge funnel read "Selected Amount 0" above "Initiated Payment 2",
  // a stage smaller than the one after it, which is the signature of broken
  // instrumentation rather than of a real drop-off (measured 2026-09-20).
  //
  // The funnel counts distinct people, so once per visit is what it needs; the ref is
  // reset after a completed recharge so a second top-up in the same visit still counts.
  // Recharge bonus offer, purely for display. The bonus that actually gets credited is
  // resolved server-side at payment time from the same config — nothing here is sent back,
  // and the server would ignore it if it were. bonusFor() below mirrors the server's
  // resolveBonus() so the screen cannot promise a figure the backend would not credit.
  const [offer, setOffer] = useState(null);
  React.useEffect(() => {
    let dead = false;
    axios
      .get(`${SOCKET_URL}/api/wallet/recharge-offer`)
      .then((r) => { if (!dead && r.data?.enabled) setOffer(r.data); })
      .catch(() => {}); // an offer we cannot fetch is simply not advertised
    return () => { dead = true; };
  }, []);

  const bonusFor = useCallback((value) => {
    const amt = Number(value);
    if (!offer?.enabled || !Number.isFinite(amt) || amt <= 0) return 0;
    const slab = (offer.slabs || [])
      .slice()
      .sort((a, b) => b.minAmount - a.minAmount)
      .find((s) => amt >= s.minAmount);
    if (!slab) return 0;
    let b = slab.type === 'percent' ? (amt * Math.min(slab.value, 100)) / 100 : slab.value;
    if (slab.maxBonus > 0) b = Math.min(b, slab.maxBonus);
    b = Math.min(b, amt);
    return Math.round(b * 100) / 100;
  }, [offer]);

  const currentBonus = bonusFor(amount);

  const amountReportedRef = useRef(false);
  const reportAmountSelected = useCallback((value, via) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    if (amountReportedRef.current) return;
    amountReportedRef.current = true;
    captureEvent('recharge_amount_selected', { amount: n, via });
  }, []);

  const handleAmountChange = useCallback((text) => {
    setAmount(text);
    reportAmountSelected(text, 'typed');
  }, [reportAmountSelected]);

  React.useEffect(() => {
    captureEvent('wallet_viewed');
    // Prefilled from the low-balance popup: the amount was chosen for them, and they can
    // pay without touching the field — so report it now or this visit never registers a
    // choice at all. This is the exact path both of 2026-09-20's recharge attempts took.
    if (suggestedAmount > 0) reportAmountSelected(suggestedAmount, 'suggested');
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server-verified flow: backend creates the Order (amount is server-trusted from
  // that point on) → checkout pays against it → backend verifies the signature before
  // crediting wallet_balance. Never credits anything based on a client-reported "success".
  const handleSubmit = async () => {
    const finalAmount = parseInt(amount, 10);
    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
      captureEvent('recharge_invalid_amount', { entered: amount });
      Alert.alert(t('wallet.invalidAmount'), t('wallet.enterValidAmount'));
      return;
    }
    // Fired on tap, before anything can fail — this is the denominator of the recharge
    // funnel. Without it a drop-off at the Razorpay sheet is indistinguishable from
    // nobody ever having tried.
    captureEvent('recharge_started', { amount: finalAmount });
    setProcessing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const authHeader = {headers: {Authorization: `Bearer ${token}`}};

      const orderRes = await axios.post(
        `${SOCKET_URL}/api/wallet/create-order`,
        {amount: finalAmount},
        authHeader,
      );
      if (!orderRes.data?.success) {
        throw new Error(orderRes.data?.message || 'Could not start payment');
      }
      const {orderId, amount: orderAmount, currency, keyId} = orderRes.data;

      // Same reason as the remedy-order sheet: with no prefill, Razorpay re-asks for the
      // mobile number and email on every single top-up. Blank fields are omitted rather
      // than sent empty, and the customer can still edit anything in the sheet.
      const prefill = await razorpayPrefill();

      const options = {
        description: 'Wallet Recharge',
        image: 'https://your-logo-url.com/logo.png',
        currency,
        key: keyId,
        amount: Math.round(orderAmount * 100),
        order_id: orderId,
        name: 'Astrowani',
        prefill,
        theme: {color: COLORS.AstroMaroon},
      };

      const data = await RazorpayCheckout.open(options);

      const verifyRes = await axios.post(
        `${SOCKET_URL}/api/wallet/verify-payment`,
        {
          razorpay_order_id: data.razorpay_order_id,
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature,
        },
        authHeader,
      );
      if (!verifyRes.data?.success) {
        throw new Error(verifyRes.data?.message || 'Payment verification failed');
      }

      captureEvent('wallet_recharged', { amount: finalAmount });
      setAmount('');
      amountReportedRef.current = false; // a second top-up this visit is a new choice
      Alert.alert(t('wallet.paymentSuccessful'), t('wallet.paymentId', { id: data.razorpay_payment_id }));
    } catch (error) {
      // Our own API failures carry a real message; Razorpay's need unwrapping, or
      // the customer is shown its raw JSON envelope. See utils/razorpayError.js —
      // both of those were live bugs on this screen.
      const apiMessage = error?.response?.data?.message;
      const rzp = describeRazorpayError(error);

      captureEvent('recharge_failed', {
        amount: finalAmount,
        cancelled: rzp.cancelled,
        reason: error?.response?.data?.code || rzp.code || (rzp.cancelled ? 'user_cancelled' : 'other'),
      });

      // Backing out of the checkout sheet is abandonment, not a failure. Saying
      // nothing is correct: nothing was charged, and the customer knows they
      // pressed back. A red "Payment Failed" there reads as though their money is
      // in limbo.
      if (rzp.cancelled && !apiMessage) {
        // Backed out of the checkout — a calm "cancelled" note, never a failure.
        showStatusPopup({ variant: 'cancelled', title: t('payment.cancelledTitle'), message: t('payment.cancelledMsg') });
      } else {
        showStatusPopup({
          variant: 'error',
          title: t('wallet.paymentFailed'),
          message: apiMessage || rzp.message || (rzp.network ? t('wallet.networkError') : t('wallet.tryAgain')),
        });
      }
    } finally {
      setProcessing(false);
    }
  };

  const renderPreset = ({item}) => (
    <TouchableOpacity
      style={styles.presetChip}
      onPress={() => {
        // A preset tap is a deliberate, discrete choice, so it reports every time
        // rather than once per visit; it still latches the ref so the subsequent
        // setAmount does not also report the same decision as 'typed'.
        amountReportedRef.current = false;
        reportAmountSelected(item, 'preset');
        setAmount(item.toString());
      }}>
      <Text style={styles.presetText}>+ ₹{item}</Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      // Android: undefined. The manifest's adjustResize already moves the screen for the
      // keyboard; 'height' here fought it and the layout flickered up and down,
      // often leaving a grey gap at the bottom after the keyboard closed.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* Tap anywhere outside the field to dismiss. accessible={false} keeps this
          wrapper invisible to screen readers, and it does not swallow taps meant
          for the buttons inside it. */}
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.dismissArea}>
      <View style={styles.headerCard}>
        <View style={styles.walletIconContainer}>
          <MaterialIcons name="account-balance-wallet" size={40} color={COLORS.AstroGold} />
        </View>
        <Text style={styles.headerTitle}>{t('wallet.addMoney')}</Text>
        <Text style={styles.headerSubtitle}>{t('wallet.rechargeSubtitle')}</Text>
      </View>

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>{t('wallet.enterAmount')}</Text>
        <View style={styles.inputWrapper}>
          <Text style={styles.currencySymbol}>₹</Text>
          <TextInput
            style={styles.amountInput}
            keyboardType="number-pad"
            value={amount}
            onChangeText={handleAmountChange}
            placeholder="0"
            placeholderTextColor="#ccc"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            inputAccessoryViewID={Platform.OS === 'ios' ? AMOUNT_ACCESSORY_ID : undefined}
          />
        </View>
      </View>

      <View>
        <FlatList
          data={TRUST_BADGES}
          keyExtractor={(b) => b.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trustRow}
          // Horizontal, not a fixed row of 4: more marks can be added to
          // TRUST_BADGES above without ever forcing the Wallet screen itself to
          // scroll vertically -- only this one strip scrolls, same pattern as the
          // preset-amount chips below it.
          renderItem={({item: b, index}) => (
            <View
              style={[
                styles.trustBadgeOuter,
                // Each badge after the first overlaps the one before it, like a
                // stacked avatar group. zIndex increasing left-to-right so a later
                // (overlapping) badge always paints over the one it covers, on
                // both platforms -- elevation can otherwise reorder Android's
                // paint order away from simple DOM order.
                index > 0 && styles.trustBadgeOverlap,
                {zIndex: index},
              ]}>
              <View style={[styles.trustBadge, b.kind === 'more' && styles.trustMoreBadge]}>
                {b.kind === 'icon' ? (
                  <FontAwesome5 name={b.name} brand size={moderateScale(24)} color={b.color} />
                ) : b.kind === 'more' ? (
                  <>
                    <Text style={styles.trustMorePlus}>+</Text>
                    <Text style={styles.trustMoreLabel}>more</Text>
                  </>
                ) : (
                  <Text style={[styles.trustBadgeText, {color: b.color}]}>{b.label}</Text>
                )}
              </View>
            </View>
          )}
        />
        <EdgeFade />
      </View>

      <View style={styles.presetSection}>
        <Text style={styles.presetLabel}>{t('wallet.recommendedAmounts')}</Text>
        <View>
        <FlatList
          data={presetAmounts}
          renderItem={renderPreset}
          keyExtractor={item => item.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetList}
        />
        <EdgeFade />
        </View>
      </View>

      {offer?.enabled && (offer.slabs || []).length > 0 && (
        <View style={styles.offerCard}>
          <View style={styles.offerHeader}>
            <MaterialIcons name="redeem" size={moderateScale(16)} color={COLORS.AstroMaroon} />
            <Text style={styles.offerTitle}>{t('wallet.offerTitle')}</Text>
          </View>
          {offer.slabs.map((s) => (
            <Text key={s.minAmount} style={styles.offerLine}>
              {t('wallet.offerSlab', { min: s.minAmount, bonus: s.example })}
            </Text>
          ))}
        </View>
      )}

      <View style={{ flex: 1 }} />

      <View style={styles.bottomSection}>
        {currentBonus > 0 && (
          <View style={styles.billDetails}>
            <Text style={styles.bonusText}>{t('wallet.bonusLine')}</Text>
            <Text style={styles.bonusAmount}>+₹{currentBonus}</Text>
          </View>
        )}
        <View style={styles.billDetails}>
          <Text style={styles.billText}>{t('wallet.totalPayable')}</Text>
          <Text style={styles.billAmount}>₹{amount || '0'}</Text>
        </View>
        {currentBonus > 0 && (
          <View style={styles.billDetails}>
            <Text style={styles.billText}>{t('wallet.walletCredit')}</Text>
            <Text style={styles.billAmount}>₹{Number(amount || 0) + currentBonus}</Text>
          </View>
        )}
        {/* Slide, not tap — this opens Razorpay and takes real money. A drag is
            much harder to trigger by accident than a button under a thumb, and it
            matches the confirm gesture used on the paid astro reports. */}
        <View style={styles.swipeWrap}>
          <SwipeToConfirm
            label={t('wallet.slideToPay')}
            confirmingLabel={t('wallet.processing')}
            onConfirm={handleSubmit}
            busy={processing}
            disabled={!amount}
          />
        </View>
      </View>
      </View>
      </TouchableWithoutFeedback>

      {/* iOS only — renders nothing on Android. Gives the number-pad the Done
          key it does not otherwise have. */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={AMOUNT_ACCESSORY_ID}>
          <View style={styles.accessoryBar}>
            <TouchableOpacity onPress={Keyboard.dismiss} style={styles.accessoryDone}>
              <Text style={styles.accessoryDoneTxt}>{t('wallet.done')}</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </KeyboardAvoidingView>
  );
};

export default Wallet;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  // Fills the screen so a tap on empty space still reaches the dismiss handler.
  dismissArea: {
    flex: 1,
  },
  accessoryBar: {
    backgroundColor: '#F1F1F4',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C7C7CC',
    alignItems: 'flex-end',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
  },
  accessoryDone: {
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
  },
  accessoryDoneTxt: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(16),
    fontWeight: '600',
  },
  headerCard: {
    backgroundColor: COLORS.AstroMaroon,
    padding: scale(25),
    paddingTop: scale(40),
    alignItems: 'center',
    borderBottomLeftRadius: moderateScale(30),
    borderBottomRightRadius: moderateScale(30),
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  walletIconContainer: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    padding: scale(15),
    borderRadius: scale(50),
    marginBottom: verticalScale(15),
  },
  headerTitle: {
    fontSize: moderateScale(22),
    fontFamily: 'Lato-Bold',
    color: COLORS.white,
    marginBottom: verticalScale(5),
  },
  headerSubtitle: {
    fontSize: moderateScale(14),
    color: '#E0E0E0',
    fontFamily: 'Lato-Regular',
  },
  inputSection: {
    backgroundColor: COLORS.white,
    marginHorizontal: scale(20),
    marginTop: verticalScale(-20),
    padding: scale(20),
    borderRadius: moderateScale(15),
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  inputLabel: {
    fontSize: moderateScale(14),
    color: '#666',
    fontFamily: 'Lato-Regular',
    marginBottom: verticalScale(10),
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.AstroMaroon,
    paddingBottom: verticalScale(5),
  },
  currencySymbol: {
    fontSize: moderateScale(30),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    marginRight: scale(10),
  },
  amountInput: {
    flex: 1,
    fontSize: moderateScale(35),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    padding: 0,
  },
  edgeFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: scale(28),
  },
  trustRow: {
    paddingHorizontal: scale(20),
    // Vertical room for the badges' own elevation shadow -- Android clips a
    // FlatList's content to its measured viewport, and with zero vertical
    // padding that viewport is exactly 48px tall (the circle itself), so the
    // shadow drawn just below each circle was being cut off in a flat line.
    paddingVertical: scale(8),
    marginTop: verticalScale(10),
    // Centres the row when its content (7 overlapping circles) is narrower
    // than the screen -- flexGrow:1 lets contentContainerStyle claim the full
    // FlatList width so justifyContent has room to actually centre within.
    flexGrow: 1,
    justifyContent: 'center',
  },
  trustBadgeOuter: {
    // No marginRight here on purpose -- spacing between badges comes ONLY from
    // trustBadgeOverlap's negative marginLeft below. A positive marginRight here
    // would partly cancel that negative margin, which is exactly what made the
    // first attempt at "overlap" barely move the circles at all.
    //
    // No ring/halo background either (tried and explicitly removed, owner's
    // call) -- plain overlapping circles, nothing behind them.
    padding: 0,
    borderRadius: scale(27),
    backgroundColor: 'transparent',
  },
  // Pulls each badge after the first back under its predecessor -- a stacked,
  // overlapping group rather than a row with gaps. -24 against a ~53px circle
  // (48 + the 2.5*2 ring padding) is a genuine, visible overlap, not just a
  // reduced gap.
  trustBadgeOverlap: {
    // -24 (half the circle) hid most of each logo behind its neighbour,
    // defeating the point of showing real recognisable marks. -10 keeps the
    // circles visibly touching/overlapping without obscuring the brand itself.
    marginLeft: -scale(10),
  },
  trustMoreBadge: {
    backgroundColor: '#fff',
  },
  trustMorePlus: {
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    lineHeight: moderateScale(16),
  },
  trustMoreLabel: {
    fontSize: moderateScale(9),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    letterSpacing: 0.2,
  },
  trustBadge: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.14,
    shadowRadius: 4,
  },
  trustBadgeText: {
    fontSize: moderateScale(11.5),
    fontFamily: 'Lato-Bold',
  },
  presetSection: {
    marginTop: verticalScale(25),
    paddingLeft: scale(20),
  },
  presetLabel: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
    color: '#333',
    marginBottom: verticalScale(15),
  },
  presetList: {
    paddingRight: scale(20),
  },
  presetChip: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    // Narrower than before so FOUR chips fit fully across the screen instead of
    // three-and-a-bit -- the half-cut fourth chip read as a rendering bug. The
    // remaining amounts still scroll in from the right.
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(20),
    marginRight: scale(12),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  presetText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
  },
  bottomSection: {
    backgroundColor: COLORS.white,
    padding: scale(20),
    paddingBottom: Platform.OS === 'ios' ? verticalScale(30) : verticalScale(20),
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offerCard: {
    marginHorizontal: scale(16),
    marginTop: verticalScale(4),
    padding: moderateScale(12),
    borderRadius: moderateScale(10),
    backgroundColor: '#FFF6E5',
    borderWidth: 1,
    borderColor: '#F0D9A8',
  },
  offerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    marginBottom: verticalScale(4),
  },
  offerTitle: {
    fontSize: moderateScale(13),
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
  },
  offerLine: {
    fontSize: moderateScale(12),
    color: '#6b4a1f',
    fontFamily: 'Lato-Regular',
    marginTop: verticalScale(1),
  },
  bonusText: {
    fontSize: moderateScale(12),
    color: '#1E7A3C',
    fontFamily: 'Lato-Bold',
  },
  bonusAmount: {
    fontSize: moderateScale(14),
    color: '#1E7A3C',
    fontFamily: 'Lato-Bold',
  },
  // No flex -- this should hug its own short text content, not compete with the
  // pill for width. It HAD flex:1 before, which is what let the pill's lack of
  // its own flex go unnoticed: the pill fell back to hugging the Label's own
  // padded content width inside SwipeToConfirm (track has no explicit width),
  // and that happened to look full-width only because the label's original
  // generous symmetric padding made that hugged width large. Centering the
  // label's text (asymmetric, smaller total padding) shrank that hugged width
  // directly -- the real fix is swipeWrap owning flex:1 below, not this.
  billDetails: {},
  billText: {
    fontSize: moderateScale(12),
    color: '#666',
    fontFamily: 'Lato-Regular',
  },
  billAmount: {
    fontSize: moderateScale(20),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    marginTop: verticalScale(2),
  },
  // flex:1 so the pill reliably fills whatever space is left after the compact
  // "Total Payable" label, regardless of the label's own text/padding -- see
  // the comment on billDetails above for why this was the missing piece.
  swipeWrap: {marginTop: verticalScale(4), flex: 1, marginLeft: scale(16)},
});
