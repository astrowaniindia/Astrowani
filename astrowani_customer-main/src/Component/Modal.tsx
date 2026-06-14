// GiftModal.js
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  FlatList,
} from 'react-native';

export default function GiftModal({ visible, onClose }:any) {
const gifts = [
  { id: '1', price: 21, image: 'https://picsum.photos/50/50?random=1' },
  { id: '2', price: 51, image: 'https://picsum.photos/50/50?random=2' },
  { id: '3', price: 108, image: 'https://picsum.photos/50/50?random=3' },
  { id: '4', price: 111, image: 'https://picsum.photos/50/50?random=4' },
  { id: '5', price: 251, image: 'https://picsum.photos/50/50?random=5' },
  { id: '6', price: 501, image: 'https://picsum.photos/50/50?random=6' },
  { id: '7', price: 751, image: 'https://picsum.photos/50/50?random=7' },
  { id: '8', price: 1008, image: 'https://picsum.photos/50/50?random=8' },
  { id: '9', price: 2100, image: 'https://picsum.photos/50/50?random=9' },
  { id: '10', price: 5100, image: 'https://picsum.photos/50/50?random=10' },
];


  return (
    <Modal transparent visible={visible} animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.balance}>₹0</Text>
            <TouchableOpacity style={styles.addMoneyBtn}>
              <Text style={styles.addMoneyText}>Add Money</Text>
            </TouchableOpacity>
          </View>

          {/* Gift Items */}
          <FlatList
            data={gifts}
            numColumns={5}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.giftItem}>
                <Image source={{ uri: item.image }} style={styles.giftImage} />
                <Text style={styles.price}>₹{item.price}</Text>
              </TouchableOpacity>
            )}
          />

          {/* Send Button */}
          <TouchableOpacity style={styles.sendBtn} onPress={onClose}>
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    minHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  balance: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#7b1fa2',
  },
  addMoneyBtn: {
    backgroundColor: '#7b1fa2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addMoneyText: {
    color: '#fff',
    fontWeight: '600',
  },
  giftItem: {
    alignItems: 'center',
    margin: 6,
  },
  giftImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  price: {
    fontSize: 12,
    color: '#333',
    marginTop: 4,
  },
  sendBtn: {
    backgroundColor: '#7b1fa2',
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 15,
  },
  sendText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
});
