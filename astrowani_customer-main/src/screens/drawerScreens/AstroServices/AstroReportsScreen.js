import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
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
import {routeForService} from '../../../utils/astroServiceRoutes';
import {astroServiceLabel} from '../../../utils/astroServiceLabel';
import {captureEvent} from '../../../utils/Analytics';

/**
 * The paid astro reports, as a browsable list.
 *
 * There was no index for these: the ten input screens were each registered in
 * Navigation.js but the only way in was the Astro Reports row part-way down Home. This
 * gives the shop-circle strip somewhere to point.
 *
 * Prices come from the server, never from a constant here — they are admin-editable on
 * the Astro Services page, and a hardcoded number would advertise one figure while the
 * wallet debited another.
 */
export default function AstroReportsScreen({navigation}) {
  const {t, language} = React.useContext(LanguageContext);
  const [services, setServices] = useState(null); // null = first load
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await getAstroServices();
      // Only services this build can actually open. An admin can add a row faster than
      // the app can ship a screen for it, and a card that does nothing when tapped is
      // worse than one that was never shown.
      setServices((rows || []).filter(s => routeForService(s.key)));
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

  const open = (service) => {
    const routeName = routeForService(service.key);
    if (!routeName) return;
    captureEvent('astro_reports_list_click', {key: service.key});
    navigation.navigate(routeName);
  };

  if (services === null) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={services}
      keyExtractor={item => String(item.key)}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.AstroMaroon]} />
      }
      ListEmptyComponent={
        <View style={styles.centre}>
          <Text style={styles.emptyText}>
            {error ? t('astroReports.loadFailed') : t('astroReports.empty')}
          </Text>
        </View>
      }
      renderItem={({item}) => (
        <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => open(item)}>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {astroServiceLabel(item, language, t)}
            </Text>
            {!!item.description && (
              <Text style={styles.cardDesc} numberOfLines={2}>
                {item.description}
              </Text>
            )}
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.price}>₹{item.price}</Text>
            <MaterialIcons
              name="chevron-right"
              size={moderateScale(22)}
              color={COLORS.AstroMaroon}
            />
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  listContent: {padding: scale(14), paddingBottom: verticalScale(30)},
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: scale(12),
    padding: scale(14),
    marginBottom: verticalScale(10),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  cardBody: {flex: 1, paddingRight: scale(10)},
  cardTitle: {
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
  },
  cardDesc: {
    marginTop: verticalScale(3),
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
    color: '#777',
  },
  cardRight: {flexDirection: 'row', alignItems: 'center'},
  price: {
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    marginRight: scale(2),
  },
});
