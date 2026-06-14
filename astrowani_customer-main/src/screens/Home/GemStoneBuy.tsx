import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Button,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import Instance from '../../api/ApiCall';
import RazorpayCheckout from 'react-native-razorpay';
import Instance from '../../api/ApiCall';
const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;

// Static color object
const color = {
  reddeep: '#B71C1C',
  white: '#FFFFFF',
  lightGrey: '#D3D3D3',
  grey: '#808080',
  black: '#000000',
};

// Define types
interface Gemstone {
  _id: string;
  name: string;
  price: number;
  images?: string[];
}

interface FormData {
  message: string;
  queryType: 'purchase' | 'inquiry';
  gemstoneId?: string;
}

interface ApiResponse {
  gemstones: Gemstone[];
  totalPages: number;
}

const GemstoneDetails: React.FC = () => {
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<Gemstone | null>(null);
  const [formData, setFormData] = useState<FormData>({
    message: '',
    queryType: 'purchase',
  });
  const [gemstones, setGemstones] = useState<Gemstone[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number | null>(1);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);

  const fetchGemstones = async (page: number = 1): Promise<void> => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Token not found');
      const response = await Instance.get<ApiResponse>(
        `/api/astro-services/gemstones?page=${page}&limit=10`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const { gemstones: fetchedGemstones, totalPages } = response.data;

      if (page === 1) {
        setGemstones(fetchedGemstones);
      } else {
        setGemstones(prev => [...prev, ...fetchedGemstones]);
      }

      if (page < totalPages) {
        setCurrentPage(page + 1);
      } else {
        setCurrentPage(null);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      console.error('Error fetching gemstones:', err.message);
    } finally {
      setLoading(false);
      setIsFetchingMore(false);
    }
  };

  const handleBuyPress = (item: Gemstone): void => {
    setSelectedProduct(item);
    setFormData(prevData => ({
      ...prevData,
      gemstoneId: item._id,
    }));
    setModalVisible(true);
  };
  const handleSubmit = () => {


    const options = {
      description: 'Wallet Recharge',
      image: 'https://your-logo-url.com/logo.png', // optional
      currency: 'INR',
      key: 'rzp_live_04dqTPGo42aCHr', // replace with your Razorpay key
      amount: 20, // Razorpay uses paise
      name: 'Astrowani',
      prefill: {
        email: 'test@example.com',
        contact: '9876543210',
        name: 'Test User',
      },
      theme: { color: '#F37254' },
    };

    RazorpayCheckout.open(options)
      .then((data: any) => {
        // Success
        Alert.alert('Payment Successful', `Payment ID: ${data.razorpay_payment_id}`);
        // Optionally, call an API to update wallet balance
      })
      .catch((error: any) => {
        // Failure
        Alert.alert('Payment Failed', error.description);
      });
  };
  const dataPost = async (): Promise<void> => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Token not found');

      const response = await Instance.post(
        '/api/astro-services/gemstone-query',
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.data) {
        handleSubmit()
        setModalVisible(false);
        setFormData({ message: '', queryType: 'purchase' });
        console.log('Response data:', response.data);

      }
      setLoading(false);
    } catch (error) {
      console.error('Error posting data:', error);
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string): void => {
    setFormData(prevData => ({ ...prevData, [field]: value }));
  };

  const handleQueryTypeChange = (type: 'purchase' | 'inquiry'): void => {
    setFormData(prevData => ({ ...prevData, queryType: type }));
  };

  const loadMoreItems = (): void => {
    if (currentPage && !isFetchingMore) {
      setIsFetchingMore(true);
      fetchGemstones(currentPage);
    }
  };

  useEffect(() => {
    fetchGemstones();
  }, []);

  if (loading && currentPage === 1) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={color.reddeep} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={color.lightGrey} />
      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={gemstones}
        keyExtractor={item => item._id}
        renderItem={({ item }) => (
          <View style={styles.productContainer}>
            <Image
              resizeMode="contain"
              source={{
                uri: item.images?.[0] || 'https://via.placeholder.com/150',
              }}
              style={styles.image}
            />
            <View style={styles.textContainer}>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.productPrice}>₹{item.price}</Text>
              <TouchableOpacity
                style={styles.buyButton}
                onPress={() => handleBuyPress(item)}>
                <Text style={styles.buyText}>Buy</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        onEndReached={loadMoreItems}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingMore && (
            <ActivityIndicator size="small" color={color.reddeep} />
          )
        }
      />

      {/* Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Message for {selectedProduct?.name}
            </Text>

            <TextInput
              placeholderTextColor={color.lightGrey}
              style={styles.input}
              placeholder="Enter your message"
              value={formData.message}
              onChangeText={text => handleInputChange('message', text)}
            />

            <View style={styles.queryTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.queryTypeButton,
                  formData.queryType === 'purchase' && styles.activeQueryType,
                ]}
                onPress={() => handleQueryTypeChange('purchase')}>
                <Text style={styles.queryTypeText}>Purchase</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.queryTypeButton,
                  formData.queryType === 'inquiry' && styles.activeQueryType,
                ]}
                onPress={() => handleQueryTypeChange('inquiry')}>
                <Text style={styles.queryTypeText}>Inquiry</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={dataPost}>
              <Text style={styles.submitText}>Submit</Text>
            </TouchableOpacity>

            <Button
              title="Close"
              onPress={() => setModalVisible(false)}
              color={color.reddeep}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingVertical: 16 },
  productContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: color.white,
    borderRadius: 8,
    elevation: 4,
    marginHorizontal: 16,
  },
  image: {
    height: screenHeight * 0.2,
    width: screenHeight * 0.2,
    borderRadius: 8,
    marginRight: 16,
  },
  textContainer: { flex: 1 },
  productName: { fontSize: 18, fontWeight: 'bold' },
  productPrice: { fontSize: 16, color: 'gray', marginTop: 8 },
  buyButton: {
    width: 80,
    padding: 4,
    backgroundColor: color.reddeep,
    borderRadius: 5,
    marginTop: 10,
  },
  buyText: { color: color.white, textAlign: 'center' },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: screenWidth - 40,
    backgroundColor: color.white,
    padding: 20,
    borderRadius: 8,
    elevation: 5,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: color.grey,
    padding: 10,
    marginBottom: 20,
    height: 50,
  },
  queryTypeContainer: { flexDirection: 'row', marginBottom: 20 },
  queryTypeButton: {
    padding: 8,
    backgroundColor: color.lightGrey,
    borderRadius: 5,
    marginRight: 10,
  },
  activeQueryType: { backgroundColor: color.reddeep },
  queryTypeText: { color: color.white },
  submitButton: {
    padding: 10,
    backgroundColor: color.reddeep,
    borderRadius: 5,
    marginBottom: 10,
  },
  submitText: { color: color.white, textAlign: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: 'red', textAlign: 'center' },
});

export default GemstoneDetails;
