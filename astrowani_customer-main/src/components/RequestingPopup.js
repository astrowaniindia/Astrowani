// src/components/RequestingPopup.js
// Drop-in "Requesting Chat…" modal for any screen
import React from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '../Theme/Colors';
import { moderateScale } from '../utils/Scaling';

const RequestingPopup = ({ visible, astro, onCancel }) => {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={COLORS.AstroMaroon} style={styles.spinner} />
          <Text style={styles.title}>Requesting Chat…</Text>
          <Text style={styles.sub}>
            Waiting for{'\n'}
            <Text style={styles.name}>{astro?.name || astro?.firstName || 'the astrologer'}</Text>
            {'\n'}to accept
          </Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 28,
    width: '78%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    elevation: 15,
  },
  spinner: { marginBottom: 16 },
  title: { color: '#fff', fontSize: moderateScale(19), fontWeight: '700', marginBottom: 8 },
  sub: { color: '#aaa', fontSize: moderateScale(14), textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  name: { color: '#FFD700', fontWeight: '700' },
  cancelBtn: {
    backgroundColor: '#F44336',
    paddingVertical: 11,
    paddingHorizontal: 36,
    borderRadius: 30,
  },
  cancelText: { color: '#fff', fontWeight: 'bold', fontSize: moderateScale(15) },
});

export default RequestingPopup;
