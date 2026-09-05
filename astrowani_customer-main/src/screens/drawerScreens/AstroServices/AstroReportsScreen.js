import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {LanguageContext} from '../../../context/LanguageContext';
import {getAstroServices} from '../../../api/astroApi';
import {routeForService, iconForService} from '../../../utils/astroServiceRoutes';
import {astroServiceLabel} from '../../../utils/astroServiceLabel';
import {captureEvent} from '../../../utils/Analytics';
import SwipeToConfirm from '../../../components/SwipeToConfirm';
import {useModalPresence} from '../../../utils/modalPresentation';

/**
 * The paid astro reports.
 *
 * A two-across grid of square-ish tiles: ten reports fit in about two screens
 * instead of five, and the artwork stays big enough to recognise. Tapping one
 * opens a sheet with the full description and a slide-to-start control, so the
 * customer sees what they are buying and makes a deliberate gesture before the
 * flow begins.
 *
 * Artwork comes from the SAME map Home uses (utils/astroServiceRoutes.js), and the
 * admin's uploaded `image` wins over it — one report can never show two different
 * pictures depending on where it was found.
 *
 * Prices come from the server, never a constant here — they are admin-editable on
 * the Astro Services page, and a hardcoded number would advertise one figure while
 * the wallet debited another.
 */
export default function AstroReportsScreen({navigation}) {
  const {t, language} = React.useContext(LanguageContext);
  const [services, setServices] = useState(null); // null = first load
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);

  useModalPresence(!!selected);

  const load = useCallback(async () => {
    try {
      const rows = await getAstroServices();
      // Only services this build can actually open. An admin can add a row faster
      // than the app can ship a screen for it, and a card that does nothing when
      // tapped is worse than one that was never shown.
      setServices((rows || []).filter((s) => routeForService(s.key)));
      setError(false);
    } catch (_) {
      setError(true);
      setServices([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const start = (service) => {
    const routeName = routeForService(service.key);
    if (!routeName) return;
    captureEvent('astro_reports_list_click', {key: service.key});
    setSelected(null);
    navigation.navigate(routeName);
  };

  if (services === null) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  const artFor = (item) => item.image || iconForService(item.key);

  const renderItem = ({item}) => (
    <TouchableOpacity style={styles.tile} activeOpacity={0.85} onPress={() => setSelected(item)}>
      <View style={styles.thumbWrap}>
        {artFor(item) ? (
          <Image source={{uri: artFor(item)}} style={styles.thumb} resizeMode="cover" />
        ) : (
          <MaterialIcons
            name="auto-stories"
            size={moderateScale(30)}
            color={COLORS.AstroMaroon}
          />
        )}
        <View style={styles.priceTag}>
          <Text style={styles.priceTagText}>₹{item.price}</Text>
        </View>
      </View>
      <Text style={styles.tileTitle} numberOfLines={2}>
        {astroServiceLabel(item, language, t)}
      </Text>
    </TouchableOpacity>
  );

  return (
    <>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={services}
        keyExtractor={(item) => String(item.key)}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.AstroMaroon]} />
        }
        ListHeaderComponent={
          services.length ? <Text style={styles.intro}>{t('astroReports.intro')}</Text> : null
        }
        ListEmptyComponent={
          <View style={styles.centre}>
            <Text style={styles.emptyText}>
              {error ? t('astroReports.loadFailed') : t('astroReports.empty')}
            </Text>
          </View>
        }
      />

      {/* Detail sheet. The grid tile is deliberately sparse — image, name, price —
          and this is where the description and the commitment live. */}
      <Modal
        transparent
        visible={!!selected}
        animationType="slide"
        onRequestClose={() => setSelected(null)}>
        {/* Tapping the dimmed area closes the sheet, which is what everyone expects
            of a bottom sheet and the easiest target to hit one-handed. The inner
            press handler is a no-op on purpose: without it the tap would bubble out
            to this one and a tap on the sheet itself would dismiss it. */}
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setSelected(null)}>
          <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
            {/* Sits on the artwork, so it needs its own contrast rather than
                borrowing the sheet's background — a bare grey glyph disappeared
                against the lighter charts. */}
            <TouchableOpacity
              style={styles.sheetClose}
              onPress={() => setSelected(null)}
              hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
              <MaterialIcons name="close" size={moderateScale(20)} color="#fff" />
            </TouchableOpacity>

            {!!selected && (
              <>
                {!!artFor(selected) && (
                  <Image
                    source={{uri: artFor(selected)}}
                    style={styles.sheetArt}
                    resizeMode="cover"
                  />
                )}
                <Text style={styles.sheetTitle}>
                  {astroServiceLabel(selected, language, t)}
                </Text>
                {!!selected.description && (
                  <Text style={styles.sheetDesc}>{selected.description}</Text>
                )}
                <Text style={styles.sheetPrice}>₹{selected.price}</Text>

                <SwipeToConfirm
                  label={t('astroReports.slideToStart')}
                  onConfirm={() => start(selected)}
                />
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  listContent: {padding: scale(12), paddingBottom: verticalScale(30)},
  row: {justifyContent: 'space-between'},
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(24),
    backgroundColor: COLORS.AstroSoftOrange,
  },
  emptyText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#666',
    textAlign: 'center',
  },
  intro: {
    fontSize: moderateScale(12.5),
    fontFamily: 'Lato-Regular',
    color: '#6B5445',
    marginBottom: verticalScale(12),
    lineHeight: moderateScale(18),
  },

  // Two per row with a gap between. `48%` rather than a computed pixel width so
  // this holds on any screen without measuring.
  tile: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: scale(12),
    padding: scale(8),
    marginBottom: verticalScale(12),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  thumbWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: scale(9),
    backgroundColor: '#FBEFE2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: {width: '100%', height: '100%'},
  priceTag: {
    position: 'absolute',
    top: scale(6),
    right: scale(6),
    backgroundColor: COLORS.AstroGold,
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    borderRadius: scale(11),
  },
  priceTagText: {
    fontSize: moderateScale(11.5),
    fontFamily: 'Lato-Bold',
    color: '#2E1A10',
  },
  tileTitle: {
    marginTop: verticalScale(7),
    marginBottom: verticalScale(2),
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    textAlign: 'center',
  },

  sheetOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: '#FFF9F3',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    padding: scale(20),
    paddingBottom: verticalScale(28),
  },
  sheetClose: {
    position: 'absolute',
    top: scale(30),
    right: scale(30),
    zIndex: 2,
    width: scale(30),
    height: scale(30),
    borderRadius: scale(15),
    alignItems: 'center',
    justifyContent: 'center',
    // Dark disc so the glyph stays legible whatever the artwork behind it is —
    // these charts are mostly pale yellows and whites.
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetArt: {
    width: '100%',
    height: verticalScale(150),
    borderRadius: scale(14),
    backgroundColor: '#FBEFE2',
  },
  sheetTitle: {
    marginTop: verticalScale(14),
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
  },
  sheetDesc: {
    marginTop: verticalScale(6),
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: '#7A6558',
    lineHeight: moderateScale(19),
  },
  sheetPrice: {
    marginTop: verticalScale(12),
    marginBottom: verticalScale(16),
    fontSize: moderateScale(22),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
  },
});
