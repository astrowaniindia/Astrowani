// App-wide "rate your session" prompt, shown automatically after a call/chat ends.
// Imperative API mirroring StatusPopup so call/chat screens can trigger it without
// wiring local state:
//
//   import { showReviewPrompt } from '../../components/ReviewPrompt';
//   showReviewPrompt({ astrologerId, name, image });
//
// Mount <ReviewPromptHost /> ONCE near the navigation root.
import React, { useEffect, useState, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, StyleSheet, Animated, Easing,
  ActivityIndicator, Image,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import Instance from '../api/ApiCall';
import { showStatusPopup } from './StatusPopup';

let listener = null;
export const showReviewPrompt = (opts) => {
  if (listener && opts && opts.astrologerId) listener(opts);
};

export function ReviewPromptHost() {
  const [target, setTarget] = useState(null); // { astrologerId, name, image }
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    listener = (opts) => {
      setRating(0);
      setComment('');
      setSubmitting(false);
      setTarget(opts);
    };
    return () => { listener = null; };
  }, []);

  useEffect(() => {
    if (target) {
      scaleAnim.setValue(0.9);
      Animated.timing(scaleAnim, {
        toValue: 1, duration: 180, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }).start();
    }
  }, [target]);

  const close = () => setTarget(null);

  const submit = async () => {
    if (!rating) return;
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await Instance.post(
        `/api/reviews/astrologer/${target.astrologerId}/review`,
        { rating, comment },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      close();
      showStatusPopup({ variant: 'success', title: 'Thank you!', message: 'Your review has been submitted.' });
    } catch (err) {
      setSubmitting(false);
      showStatusPopup({
        variant: 'info',
        title: 'Could not submit',
        message: err?.response?.data?.error || 'Failed to submit your review. Please try again.',
      });
    }
  };

  if (!target) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          {target.image ? (
            <Image source={{ uri: target.image }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <MaterialIcons name="person" size={moderateScale(34)} color="#fff" />
            </View>
          )}
          <Text style={styles.title}>Rate your session</Text>
          {!!target.name && <Text style={styles.subtitle}>with {target.name}</Text>}

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                <MaterialIcons
                  name={star <= rating ? 'star' : 'star-border'}
                  size={moderateScale(40)}
                  color={star <= rating ? COLORS.AstroGold : COLORS.AstroMaroon}
                  style={{ marginHorizontal: moderateScale(2) }}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Share your experience (optional)"
            placeholderTextColor="#999"
            multiline
            value={comment}
            onChangeText={setComment}
          />

          <TouchableOpacity
            style={[styles.button, (!rating || submitting) && styles.buttonDisabled]}
            activeOpacity={0.85}
            disabled={!rating || submitting}
            onPress={submit}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Submit Review</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={close} style={styles.skipBtn}>
            <Text style={styles.skipText}>Maybe later</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(30),
  },
  card: {
    width: '100%', backgroundColor: '#fff', borderRadius: moderateScale(20),
    paddingVertical: verticalScale(24), paddingHorizontal: scale(22), alignItems: 'center',
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16,
  },
  avatar: { width: scale(64), height: scale(64), borderRadius: scale(32), marginBottom: verticalScale(10) },
  avatarFallback: {
    width: scale(64), height: scale(64), borderRadius: scale(32), marginBottom: verticalScale(10),
    backgroundColor: COLORS.AstroMaroon, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: moderateScale(18), fontWeight: 'bold', color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', textAlign: 'center' },
  subtitle: { fontSize: moderateScale(13), color: '#777', fontFamily: 'Lato-Regular', marginTop: verticalScale(2), marginBottom: verticalScale(10) },
  starsRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: verticalScale(10) },
  input: {
    width: '100%', borderWidth: 1, borderColor: '#ddd', borderRadius: moderateScale(10),
    padding: scale(12), color: '#000', fontFamily: 'Lato-Regular', textAlignVertical: 'top',
    fontSize: moderateScale(14), minHeight: verticalScale(70), marginBottom: verticalScale(16),
  },
  button: {
    backgroundColor: COLORS.AstroMaroon, borderRadius: moderateScale(25),
    paddingVertical: verticalScale(11), width: '100%', alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: moderateScale(15), fontFamily: 'Lato-Bold' },
  skipBtn: { marginTop: verticalScale(12) },
  skipText: { color: '#999', fontSize: moderateScale(13), fontFamily: 'Lato-Regular' },
});

export default ReviewPromptHost;
