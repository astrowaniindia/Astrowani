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
};

type FreeServicesScreenProps = {
  services: ServiceItem[];
  onServiceSelect: (item: ServiceItem) => void;
  loading?: boolean;
};

const FreeServicesScreen: React.FC<FreeServicesScreenProps> = ({
  services,
  onServiceSelect,
  loading = false,
}) => {
  const renderService = ({ item }: { item: ServiceItem }) => (

    <TouchableOpacity 
      onPress={() => onServiceSelect(item)} 
      style={styles.serviceBox}
      activeOpacity={0.7}
    >
      {item.icon ? (
        <Image 
          source={{ uri: item.icon }} 
          style={styles.icon} 
          resizeMode="contain"
          onError={(e) => console.log('Error loading image:', e.nativeEvent.error)}
        />
      ) : (
        <MaterialIcons name="image-not-supported" size={scale(30)} color={COLORS.lightGrey} />
      )}
      <Text style={styles.serviceText} numberOfLines={2}>
        {item.title}
      </Text>
    </TouchableOpacity>
  );

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
    borderRadius: moderateScale(16),
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(20),
    marginRight: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    width: scale(120),
    height: verticalScale(140),
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  icon: {
    width: scale(50),
    height: scale(50),
    marginBottom: verticalScale(12),
  },
  serviceText: {
    fontSize: moderateScale(14),
    textAlign: 'center',
    color: COLORS.black,
    fontFamily: 'Lato-Bold',
    marginTop: verticalScale(5),
  },
});

export default FreeServicesScreen;