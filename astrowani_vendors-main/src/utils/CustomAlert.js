import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, DeviceEventEmitter } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../Theme/Colors';

const { width } = Dimensions.get('window');

const CustomAlert = () => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState({
    title: '',
    message: '',
    type: 'success', // 'success' or 'error'
    buttonText: 'OK',
    onClose: null,
  });

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('SHOW_ALERT', (params) => {
      setConfig({
        title: params.title || '',
        message: params.message || '',
        type: params.type || 'success',
        buttonText: params.buttonText || 'OK',
        onClose: params.onClose || null,
      });
      setVisible(true);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleClose = () => {
    setVisible(false);
    if (config.onClose) {
      config.onClose();
    }
  };

  const isSuccess = config.type === 'success';

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.alertContainer}>
          <View style={[styles.iconContainer, { backgroundColor: isSuccess ? '#e8f5e9' : '#ffebee' }]}>
            <Icon 
              name={isSuccess ? 'checkmark-circle' : 'alert-circle'} 
              size={50} 
              color={isSuccess ? '#4CAF50' : '#f44336'} 
            />
          </View>
          
          <Text style={styles.title}>{config.title}</Text>
          <Text style={styles.message}>{config.message}</Text>
          
          <TouchableOpacity 
            style={[styles.button, { backgroundColor: isSuccess ? COLORS.AstroMaroon : '#f44336' }]} 
            onPress={handleClose}
          >
            <Text style={styles.buttonText}>{config.buttonText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export const showAlert = (title, message, type = 'success', onClose = null, buttonText = 'OK') => {
  DeviceEventEmitter.emit('SHOW_ALERT', { title, message, type, onClose, buttonText });
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContainer: {
    width: width * 0.85,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default CustomAlert;
