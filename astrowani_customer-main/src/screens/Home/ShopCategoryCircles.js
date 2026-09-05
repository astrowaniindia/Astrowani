import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {LanguageContext} from '../../context/LanguageContext';
import {captureEvent} from '../../utils/Analytics';

/**
 * The three Wani Shop entry points, as a circular icon strip above the Home banner.
 *
 * Replaces the old "Astrowani Remedies" category row further down Home, which sent
 * customers into the NATIVE RemedyShop while the bottom tab labelled "Wani Shop" sent
 * them to the web storefront — two different shops, two different names, one confused
 * customer. Everything here goes to the same place the tab does.
 *
 * Icons rather than photographs on purpose: there is no bundled vastu image and no
 * vastu row in /api/remedy-categories (that list is fixed at puja / gemstone /
 * specific_puja / life_report), so a photo strip would have had two real images and
 * one placeholder. Swap to images later by giving each CATEGORIES entry an `image`
 * and rendering it in place of the icon — the layout does not change.
 */
// `path` is appended to the storefront root by StoreWebView; `screen` opens a native
// screen instead. Exactly one of the two per entry.
//
// Pyramids is 277 of the 497 items in the catalogue — more than everything else put
// together — and was previously reachable only by opening Vastu and tapping a tile.
// `?cat=pyramids` is read by astrowani-shop/store.js and validated there, so a rename
// on either side degrades to the full Vastu list rather than an empty grid.
const CATEGORIES = [
  {id: 'gemstone', icon: 'diamond-stone', labelKey: 'home.shopGemstones', path: 'gemstones/'},
  {id: 'puja', icon: 'flower-tulip', labelKey: 'home.shopPujas', path: 'pujas/'},
  {id: 'vastu', icon: 'home-city', labelKey: 'home.shopVastu', path: 'vastu/'},
  {id: 'pyramids', icon: 'triangle-outline', labelKey: 'home.shopPyramids', path: 'vastu/?cat=pyramids'},
  {id: 'reports', icon: 'file-document-outline', labelKey: 'home.shopReports', screen: 'AstroReportsScreen'},
];

export default function ShopCategoryCircles({navigation}) {
  const {t} = React.useContext(LanguageContext);

  const open = (category) => {
    captureEvent('home_screen_click', {section: 'shop_circle', label: category.id});
    if (category.screen) {
      navigation.navigate(category.screen);
    } else {
      navigation.navigate('Store', {path: category.path});
    }
  };

  return (
    <View style={styles.row}>
      {CATEGORIES.map((c) => (
        <TouchableOpacity
          key={c.id}
          style={styles.item}
          activeOpacity={0.7}
          onPress={() => open(c)}>
          <View style={styles.circle}>
            <MaterialCommunityIcons
              name={c.icon}
              size={moderateScale(18)}
              color={COLORS.AstroMaroon}
            />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {t(c.labelKey)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    paddingHorizontal: scale(15),
    marginBottom: verticalScale(14),
  },
  item: {
    alignItems: 'center',
    // Bounded so a longer translated label wraps the row's spacing rather than
    // pushing its neighbours out of alignment.
    width: scale(64),
  },
  circle: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(19),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(89, 42, 25, 0.15)',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  label: {
    marginTop: verticalScale(4),
    fontSize: moderateScale(10),
    fontFamily: 'Lato-Regular',
    color: COLORS.AstroMaroon,
    textAlign: 'center',
  },
});
