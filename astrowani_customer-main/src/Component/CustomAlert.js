import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, DeviceEventEmitter } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../Theme/Colors';
import {useDeferredPresent, useModalPresence} from '../utils/modalPresentation';
import { isGenericTitle, alertTone } from '../utils/alertTone';
import { translate } from '../context/LanguageContext';

// One look per tone. Nothing is bright red: a real failure is a soft amber
// warning, and a cancellation is a neutral "closed" mark — see utils/alertTone.
const TONES = {
  success:     { icon: 'checkmark-circle',          color: '#2E8B57', tint: '#e8f5ec' },
  cancelled:   { icon: 'close-circle-outline',      color: '#7d6b64', tint: '#f3eeec' },
  network:     { icon: 'cloud-offline-outline',     color: '#6B1F2A', tint: '#f6ecec' },
  permission:  { icon: 'lock-closed-outline',       color: '#6B1F2A', tint: '#f6ecec' },
  unavailable: { icon: 'time-outline',              color: '#B8860B', tint: '#fbf3dc' },
  warning:     { icon: 'alert-circle-outline',      color: '#D9822B', tint: '#fdf1e5' },
  info:        { icon: 'information-circle-outline', color: '#6B1F2A', tint: '#f6ecec' },
};

const { width } = Dimensions.get('window');

const CustomAlert = () => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState({
    title: '',
    message: '',
    type: 'info', // see TONES / utils/alertTone
    buttonText: 'OK',
    onClose: null,
    autoHideMs: 0,
  });

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('SHOW_ALERT', (params) => {
      setConfig({
        title: params.title || '',
        message: params.message || '',
        // Callers that pass 'error' mean "not a success" — let the words decide how
        // it looks, so "please enter your number" is a notice, not a failure.
        type: params.type === 'error'
          ? (t => (t === 'success' ? 'warning' : t))(alertTone(params.title, params.message))
          : (params.type || 'info'),
        buttonText: params.buttonText || 'OK',
        onClose: params.onClose || null,
        autoHideMs: params.autoHideMs || 0,
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

  // App.js routes every Alert.alert through this component, so it can fire from
  // inside an open screen modal — the exact presentation iOS refuses. Waiting
  // until the stack is clear turns a frozen app into a slightly later alert.
  const ready = useDeferredPresent(visible);
  useModalPresence(ready);

  // Auto-closing notice (showAutoAlert): no button, closes itself. The clock starts
  // when the popup is actually on screen, not when it was requested.
  useEffect(() => {
    if (!ready || !config.autoHideMs) return undefined;
    const timer = setTimeout(handleClose, config.autoHideMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, config]);

  const tone = TONES[config.type] || TONES[config.type === 'error' ? 'warning' : 'info'];
  // "Error" as a title tells the customer nothing and reads like a crash.
  const title = isGenericTitle(config.title)
    ? translate(config.type === 'warning' || config.type === 'error' ? 'common.somethingWrongTitle' : 'common.pleaseNoteTitle')
    : config.title;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={ready}
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        disabled={!config.autoHideMs}
        onPress={handleClose}>
        <View style={styles.alertContainer}>
          <View style={[styles.iconContainer, { backgroundColor: tone.tint }]}>
            <Icon name={tone.icon} size={50} color={tone.color} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{config.message}</Text>
          
          {!config.autoHideMs && (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: COLORS.AstroGold || '#FFD700' }]}
              onPress={handleClose}
            >
              <Text style={[styles.buttonText, { color: COLORS.AstroMaroon || '#000' }]}>{config.buttonText}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

export const showAlert = (title, message, type = 'success', onClose = null, buttonText = 'OK') => {
  DeviceEventEmitter.emit('SHOW_ALERT', { title, message, type, onClose, buttonText });
};

// Same popup with no button: it closes by itself after `ms` (a tap anywhere closes
// it sooner). For notices that need no decision, e.g. "no account, taking you to signup".
export const showAutoAlert = (title, message, type = 'info', ms = 3000) => {
  DeviceEventEmitter.emit('SHOW_ALERT', { title, message, type, autoHideMs: ms });
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
