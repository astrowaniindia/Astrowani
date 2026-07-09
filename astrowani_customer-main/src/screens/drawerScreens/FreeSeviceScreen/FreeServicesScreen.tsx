import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { moderateScale, scale, verticalScale } from '../../../utils/Scaling';
import { COLORS } from '../../../Theme/Colors';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

// Define types for your service items
type ServiceItem = {
  id: number | string;
  title: string;
  icon: string;
  description?: string;
  price?: number;
};

type FreeServicesScreenProps = {
  services: ServiceItem[];
  onServiceSelect: (item: ServiceItem) => void;
  loading?: boolean;
  showPrice?: boolean;
  // 'badge' (default): small circular icon, for fixed in-app tools (Panchang, Kundali…).
  // 'image': full-width top image like a blog card — for admin-managed content
  // (Astro Reports) where the image and title are edited from the admin dashboard.
  variant?: 'badge' | 'image';
};

const FreeServicesScreen: React.FC<FreeServicesScreenProps> = ({
  services,
  onServiceSelect,
  loading = false,
  showPrice = false,
  variant = 'badge',
}) => {
  const renderService = ({ item }: { item: ServiceItem }) => {
    if (variant === 'image') {
      return (
        <TouchableOpacity
          onPress={() => onServiceSelect(item)}
          style={styles.imageCard}
          activeOpacity={0.85}
        >
          <View style={styles.imageCardImageWrap}>
            {item.icon ? (
              <Image
                source={{ uri: item.icon }}
                style={styles.imageCardImage}
                resizeMode="cover"
                onError={(e) => console.log('Error loading image:', e.nativeEvent.error)}
              />
            ) : (
              <View style={[styles.imageCardImage, styles.imageCardImageFallback]}>
                <MaterialIcons name="image-not-supported" size={scale(30)} color={COLORS.lightGrey} />
              </View>
            )}
            {showPrice && item.price != null && (
              <View style={styles.priceBadge}>
                <Text style={styles.priceBadgeText}>₹{item.price}</Text>
              </View>
            )}
          </View>
          <Text style={styles.imageCardText} numberOfLines={2}>
            {item.title}
          </Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        onPress={() => onServiceSelect(item)}
        style={styles.serviceBox}
        activeOpacity={0.7}
      >
        {showPrice && item.price != null && (
          <View style={styles.priceBadge}>
            <Text style={styles.priceBadgeText}>₹{item.price}</Text>
          </View>
        )}
        <View style={styles.iconBadge}>
          {item.icon ? (
            <Image
              source={{ uri: item.icon }}
              style={styles.icon}
              resizeMode="contain"
              onError={(e) => console.log('Error loading image:', e.nativeEvent.error)}
            />
          ) : (
            <MaterialIcons name="image-not-supported" size={scale(26)} color={COLORS.lightGrey} />
          )}
        </View>
        <Text style={styles.serviceText} numberOfLines={2}>
          {item.title}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.AstroSoftOrange} />
      </SafeAreaView>
    );
  }
  if (!services || services.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No services available</Text>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={services}
        renderItem={renderService}
        horizontal
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.servicesContainer}
        showsHorizontalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No services found</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(20),
  },
  emptyText: {
    fontSize: moderateScale(16),
    color: COLORS.lightGrey,
    fontFamily: 'Lato-Regular',
  },
  servicesContainer: {
    paddingVertical: verticalScale(15),
    paddingHorizontal: scale(16),
  },
  serviceBox: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(18),
    marginRight: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    width: scale(120),
    height: verticalScale(144),
    overflow: 'hidden',
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  priceBadge: {
    position: 'absolute',
    top: verticalScale(10),
    right: scale(10),
    backgroundColor: COLORS.AstroGold,
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(3),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  priceBadgeText: {
    fontSize: moderateScale(10),
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
  },
  iconBadge: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    backgroundColor: COLORS.AstroSoftOrange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(12),
  },
  icon: {
    width: scale(38),
    height: scale(38),
  },
  serviceText: {
    fontSize: moderateScale(13),
    textAlign: 'center',
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    marginTop: verticalScale(2),
  },
  imageCard: {
    backgroundColor: '#fff',
    width: scale(150),
    borderRadius: moderateScale(16),
    marginRight: scale(12),
    overflow: 'hidden',
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  imageCardImageWrap: {
    width: '100%',
    height: verticalScale(100),
  },
  imageCardImage: {
    width: '100%',
    height: '100%',
  },
  imageCardImageFallback: {
    backgroundColor: COLORS.AstroSoftOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageCardText: {
    fontSize: moderateScale(13),
    textAlign: 'center',
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(10),
  },
});

export default FreeServicesScreen;