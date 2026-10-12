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
import React, { useContext } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';

const AttachSourceSheet = ({ visible, onClose, onPick }) => {
  const { t } = useContext(LanguageContext);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Tapping the dimmed area closes it — the gesture everyone already expects
          from a sheet, and the only way out on a phone with gesture navigation
          where there is no visible back button. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} onPress={() => {}}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{t('chatImage.sendPhoto')}</Text>
          <Text style={styles.subtitle}>{t('chatImage.photosOnly')}</Text>

          <TouchableOpacity style={styles.row} onPress={() => onPick({ fromCamera: true })}>
            <View style={styles.iconCircle}>
              <Ionicons name="camera" size={21} color="#fff" />
            </View>
            <Text style={styles.rowTxt}>{t('chatImage.takePhoto')}</Text>
            <Ionicons name="chevron-forward" size={18} color="#bbb" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => onPick({ fromCamera: false })}>
            <View style={styles.iconCircle}>
              <Ionicons name="images" size={20} color="#fff" />
            </View>
            <Text style={styles.rowTxt}>{t('chatImage.chooseFromGallery')}</Text>
            <Ionicons name="chevron-forward" size={18} color="#bbb" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancel} onPress={onClose}>
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
