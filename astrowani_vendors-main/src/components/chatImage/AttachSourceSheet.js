// ─────────────────────────────────────────────────────────────────────────────
// AttachSourceSheet — "Camera or Gallery?", as a bottom sheet.
//
// Its own component, and not the platform action sheet, for two reasons: Android's
// has no equivalent, and this one is in the app's own colours and speaks the user's
// own language (both apps run in English or Hindi). Shared verbatim with the
// astrologer app.
//
// "Only photos" is said out loud in the subtitle. The chat accepts images and
// nothing else — no documents, no video — and saying so here is cheaper than
// letting someone hunt for a file attachment that does not exist.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useContext, useRef } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Pressable, Platform, InteractionManager } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';

const AttachSourceSheet = ({ visible, onClose, onPick }) => {
  const { t } = useContext(LanguageContext);
  const insets = useSafeAreaInsets();
  // THE CHOICE IS REMEMBERED AND ACTED ON AFTER THIS SHEET HAS ACTUALLY GONE, never
  // in the row's own onPress.
  //
  // iOS presents the camera and the photo library as view controllers on top of the
  // key window. Asking for one while THIS Modal is still playing its dismissal
  // animation hands it a presenter that is on its way out, and iOS tears the picker
  // down with it -- which is exactly what was reported from TestFlight on 2026-10-24:
  // the gallery never appeared at all, and the camera flashed up and closed itself
  // after about a second. `onDismiss` is the real "the modal is gone now" signal, so
  // the launch hangs off that instead of a guessed delay.
  //
  // Android gets no onDismiss, and does not need one: there the picker is a separate
  // Activity, so nothing about this Modal can interfere with it.
  const pendingRef = useRef(null);

  const flush = () => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) onPick(pending);
  };

  const choose = (opts) => {
    pendingRef.current = opts;
    onClose();
    if (Platform.OS !== 'ios') {
      InteractionManager.runAfterInteractions(flush);
    }
  };

  // Backing out must not leave a choice armed, or the next time the sheet closes for
  // any reason the picker would open on its own.
  const cancel = () => {
    pendingRef.current = null;
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={cancel}
      onDismiss={Platform.OS === 'ios' ? flush : undefined}
      statusBarTranslucent>
      {/* Tapping the dimmed area closes it — the gesture everyone already expects
          from a sheet, and the only way out on a phone with gesture navigation
          where there is no visible back button. */}
      <Pressable style={styles.backdrop} onPress={cancel}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} onPress={() => {}}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{t('chatImage.sendPhoto')}</Text>
          <Text style={styles.subtitle}>{t('chatImage.photosOnly')}</Text>

          <TouchableOpacity style={styles.row} onPress={() => choose({ fromCamera: true })}>
            <View style={styles.iconCircle}>
              <Ionicons name="camera" size={21} color="#fff" />
            </View>
            <Text style={styles.rowTxt}>{t('chatImage.takePhoto')}</Text>
            <Ionicons name="chevron-forward" size={18} color="#bbb" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => choose({ fromCamera: false })}>
            <View style={styles.iconCircle}>
              <Ionicons name="images" size={20} color="#fff" />
            </View>
            <Text style={styles.rowTxt}>{t('chatImage.chooseFromGallery')}</Text>
            <Ionicons name="chevron-forward" size={18} color="#bbb" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancel} onPress={cancel}>
            <Text style={styles.cancelTxt}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, paddingHorizontal: 18 },
  grabber: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#ddd', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: '#222' },
  subtitle: { fontSize: 12.5, color: '#888', marginTop: 2, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee' },
  iconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.AstroMaroon, alignItems: 'center', justifyContent: 'center' },
  rowTxt: { flex: 1, fontSize: 15.5, color: '#222', fontWeight: '600' },
  cancel: { marginTop: 14, paddingVertical: 13, borderRadius: 14, backgroundColor: '#f4f4f4', alignItems: 'center' },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: '#555' },
});

export default AttachSourceSheet;
