// Shared visual tokens for the remedies shop screens.
//
// WHY: the shop is eight screens (grid, detail, cart, addresses, address form, payment,
// order success, my orders) and they were each hand-styling their own greys, radii and
// shadows. They drifted immediately — the same "card" was #F5F5F5 with a 1px #eee border on
// one screen and white with an elevation on the next, and the same body copy was #555,
// #666 and #777 depending on the file.
//
// These are the single source of truth. The palette is deliberately WARM rather than the
// stock material greys, because the shop sits inside a maroon/soft-orange brand and neutral
// grey read as a different app bolted on.
//
// Add to this file rather than inventing a new hex in a screen. If a value is needed twice,
// it belongs here.

import { StyleSheet } from 'react-native';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

export const SHOP = {
  // Surfaces
  screenBg: '#F7F3EF',   // warm off-white; replaces the stock #F5F5F5 grey
  surface: COLORS.white,
  surfaceAlt: '#FAF6F2', // image wells, inset rows
  border: '#F0E6DC',

  // Text
  text: '#2B1A11',       // near-black with a brown cast, not pure #000
  textSoft: '#6B5A50',   // body copy
  textMuted: '#9A8B80',  // labels, captions
  strike: '#A99A90',     // struck-through MRP

  // Accents
  brand: COLORS.AstroMaroon,
  brandTint: COLORS.AstroSoftOrange,
  success: '#2E7D32',
  successBg: '#E8F5E9',
  warn: '#B26A00',
  warnBg: '#FFF8E1',
  warnBorder: '#FFE082',
  danger: '#C0392B',

  // Geometry
  radius: moderateScale(14),
  radiusSm: moderateScale(9),
  radiusPill: moderateScale(22),
};

// One card treatment for the whole shop: white, warm hairline border, soft lift. Screens
// spread this and add their own padding/margins.
export const cardShadow = {
  backgroundColor: SHOP.surface,
  borderRadius: SHOP.radius,
  borderWidth: 1,
  borderColor: SHOP.border,
  elevation: 3,
  shadowColor: '#4a2412',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 5,
};

export const shopStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SHOP.screenBg },
  card: { ...cardShadow, padding: scale(14) },

  // Small uppercase label above a group of fields or rows.
  sectionLabel: {
    fontSize: moderateScale(11),
    fontFamily: 'Lato-Bold',
    color: SHOP.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: verticalScale(7),
  },

  divider: { height: 1, backgroundColor: SHOP.border },

  // Primary action, used for every full-width confirm button in the flow.
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SHOP.brand,
    borderRadius: moderateScale(11),
    paddingVertical: verticalScale(13),
  },
  primaryBtnDisabled: { backgroundColor: '#CFC4BC' },
  primaryBtnText: {
    color: COLORS.white,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14.5),
  },

  // The sticky bar every checkout step ends with. Screens must reserve its height in their
  // scroll container's paddingBottom, or content runs underneath it (see the bug fixed on
  // ProductDetail, where two competing bars hid the description).
  stickyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SHOP.surface,
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    borderTopWidth: 1,
    borderTopColor: SHOP.border,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },

  // A soft attention block — used for "not delivering here yet", out of stock, and the
  // no-address-yet prompt. Amber, never red: these are things to fix, not failures.
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SHOP.warnBg,
    borderRadius: SHOP.radiusSm,
    borderWidth: 1,
    borderColor: SHOP.warnBorder,
    padding: scale(11),
  },
  noticeText: {
    flex: 1,
    marginLeft: scale(8),
    fontSize: moderateScale(12),
    color: '#7A4F00',
    lineHeight: verticalScale(17),
  },

  emptyWrap: { alignItems: 'center', paddingVertical: verticalScale(70), paddingHorizontal: scale(30) },
  emptyTitle: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: SHOP.text,
    marginTop: verticalScale(14),
  },
  emptySub: {
    fontSize: moderateScale(13),
    color: SHOP.textMuted,
    marginTop: verticalScale(6),
    textAlign: 'center',
    lineHeight: verticalScale(19),
  },
});

export default SHOP;
