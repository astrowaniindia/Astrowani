// LalKitabAssistantScreen.js — the Lal Kitab assistant: a chat with an AI
// astrologer that reads the customer's own Lal Kitab chart and gives the remedies
// written in it.
//
// Visually follows FreeBotChatScreen.js, which itself mirrors the real
// consultation screen, so this reads as a genuine session rather than a widget.
// What it deliberately does NOT copy from there: the 5-minute timer, the gift
// banner and the "chat complete" modal. This conversation has no clock — it ends
// when the customer leaves.
//
// TWO STEPS, and the first one is not optional. A Lal Kitab remedy is chosen by
// which HOUSE a planet falls in, so the chart needs the date, the exact time AND
// the birthplace coordinates. The saved profile cannot supply them:
// customers.place_of_birth is free text with no latitude or longitude columns. So
// the intake step uses the same BirthDetailsForm the paid reports use, because
// PlaceAutocomplete inside it is what turns a place name into coordinates.
//
// Replies come from POST /api/lal-kitab/chat/reply. The backend answers with
// `source: 'ai'` or `source: 'scripted'`; a scripted reply is still a real remedy
// quoted from the customer's own chart, not an apology, so the screen shows it
// exactly like any other message and says nothing about it. The only thing it
// surfaces is the chart being missing.
//
// VOICE is utils/lalKitabVoice.js: Android's own on-device engines, free, no
// per-minute cost. Both buttons are hidden unless the native modules are really
// present, so this screen is OTA-safe for builds that predate them — those get a
// text-only chat. Speaking is opt-in per chat (the speaker starts OFF): a reply
// read aloud unasked, in a room with other people, is worse than silence.

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import Instance from '../../api/ApiCall';
import BirthDetailsForm from '../drawerScreens/AstroServices/BirthDetailsForm';
import { LanguageContext } from '../../context/LanguageContext';
import { showStatusPopup } from '../../components/StatusPopup';
import { captureEvent } from '../../utils/Analytics';
import { ensureCallPermissions } from '../../utils/callPermissions';
import voice from '../../utils/lalKitabVoice';

// Longer than the backend's own 15s budget across its key chain and model list,
// so the server always answers "scripted" first and this only catches the server
// itself being slow. The same relationship FreeBotChatScreen has with /reply.
const REQUEST_TIMEOUT_MS = 20000;

const uid = () => `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function LalKitabAssistantScreen({ navigation }) {
  const { t, language } = useContext(LanguageContext);
  const insets = useSafeAreaInsets();
  const lang = language === 'Hindi' ? 'hi' : 'en';

  const [step, setStep] = useState('intake'); // 'intake' | 'chat'
  const [values, setValues] = useState({ isComplete: false });
  const [starting, setStarting] = useState(false);

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [hasChart, setHasChart] = useState(false);

  const [speakOn, setSpeakOn] = useState(false);
  const [listening, setListening] = useState(false);

  const conversationIdRef = useRef(null);
  const sendingRef = useRef(false);
  const stopListeningRef = useRef(null);
  const listRef = useRef(null);
  const mountedRef = useRef(true);

  // One teardown for both engines. Without it a reply keeps being read aloud
  // after the customer has left the screen, and an open recogniser holds the mic.
  useEffect(() => () => {
    mountedRef.current = false;
    if (stopListeningRef.current) stopListeningRef.current();
    voice.destroyVoice();
  }, []);

  const push = useCallback((sender, message) => {
    setMessages((prev) => prev.concat([{ id: uid(), sender, message, at: Date.now() }]));
  }, []);

  /** Speak a reply, but only if the customer asked for audio in this chat. */
  const maybeSpeak = useCallback((reply) => {
    if (!speakOn) return;
    voice.speak(reply, { language: lang });
  }, [speakOn, lang]);

  /* ---------------------------------------------------------------- */
  /* Starting                                                         */
  /* ---------------------------------------------------------------- */

  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const { data } = await Instance.post(
        '/api/lal-kitab/chat/start',
        {
          language: lang,
          birth: {
            date: values.date,
            time: values.time,
            latitude: values.latitude,
            longitude: values.longitude,
            tz: values.tz,
            lang,
          },
        },
        { headers: await authHeaders(), timeout: REQUEST_TIMEOUT_MS },
      );
      if (!mountedRef.current) return;
      conversationIdRef.current = data?.conversationId || null;
      setHasChart(!!data?.hasChart);
      const opening = data?.opening || t('lalKitabAssistant.fallbackOpening');
      setMessages([{ id: uid(), sender: 'bot', message: opening, at: Date.now() }]);
      setStep('chat');
      captureEvent('lal_kitab_chat_started', { has_chart: !!data?.hasChart });
      // Not maybeSpeak: the speaker is off at this point by design, and the
      // opening is on screen. Speaking starts when the customer turns it on.
    } catch (e) {
      const status = e?.response?.status;
      showStatusPopup({
        type: 'error',
        title: t('lalKitabAssistant.cannotStartTitle'),
        message: status === 503
          ? t('lalKitabAssistant.notAvailable')
          : (e?.response?.data?.message || t('lalKitabAssistant.cannotStartMsg')),
      });
    }
    if (mountedRef.current) setStarting(false);
  };

  /* ---------------------------------------------------------------- */
  /* One turn                                                         */
  /* ---------------------------------------------------------------- */

  const send = async (raw) => {
    const body = String(raw === undefined ? text : raw).trim();
    if (!body) return;
    // Claimed before the first await: two taps of Send land together otherwise
    // and both spend a turn answering the same message.
    if (sendingRef.current) return;
    sendingRef.current = true;

    setText('');
    const history = messages.map((m) => ({ sender: m.sender === 'bot' ? 'bot' : 'me', message: m.message }));
    push('me', body);
    setTyping(true);
    await voice.stopSpeaking(); // the customer has spoken; stop talking over them

    try {
      const { data } = await Instance.post(
        '/api/lal-kitab/chat/reply',
        {
          conversationId: conversationIdRef.current,
          message: body,
          history,
          language: lang,
        },
        { headers: await authHeaders(), timeout: REQUEST_TIMEOUT_MS },
      );
      if (!mountedRef.current) return;
      const reply = data?.reply;
      if (data?.conversationId) conversationIdRef.current = data.conversationId;
      if (typeof data?.hasChart === 'boolean') setHasChart(data.hasChart);
      if (reply) {
        push('bot', reply);
        maybeSpeak(reply);
      } else {
        // The server always sends something, so this is the server itself being
        // wrong rather than the AI being unavailable.
        push('bot', t('lalKitabAssistant.fallbackReply'));
      }
    } catch (e) {
      if (mountedRef.current) {
        const status = e?.response?.status;
        push('bot', status === 503
          ? t('lalKitabAssistant.notAvailable')
          : t('lalKitabAssistant.networkTrouble'));
      }
    }
    if (mountedRef.current) setTyping(false);
    sendingRef.current = false;
  };

  /* ---------------------------------------------------------------- */
  /* Press to talk                                                    */
  /* ---------------------------------------------------------------- */

  const toggleListening = async () => {
    if (listening) {
      if (stopListeningRef.current) await stopListeningRef.current();
      stopListeningRef.current = null;
      setListening(false);
      return;
    }
    // Ask at the tap, not on mount — the lesson from the 2026-10-21 call
    // investigation, where a permission dialog raced a watchdog armed at mount.
    const ok = await ensureCallPermissions({ video: false });
    if (!ok) return;

    setListening(true);
    stopListeningRef.current = await voice.startListening({
      language: lang,
      onPartial: (partial) => { if (mountedRef.current) setText(partial); },
      onResult: (said) => {
        stopListeningRef.current = null;
        if (!mountedRef.current) return;
        setListening(false);
        if (said) send(said);
        else setText('');
      },
      onError: () => {
        stopListeningRef.current = null;
        if (!mountedRef.current) return;
        setListening(false);
        setText('');
        showStatusPopup({
          type: 'info',
          title: t('lalKitabAssistant.didNotCatchTitle'),
          message: t('lalKitabAssistant.didNotCatchMsg'),
        });
      },
    });
  };

  const toggleSpeak = async () => {
    const next = !speakOn;
    setSpeakOn(next);
    if (!next) {
      await voice.stopSpeaking();
      return;
    }
    // Read the latest reply straight away, so turning the speaker on does
    // something rather than silently waiting for the next message.
    const lastBot = [...messages].reverse().find((m) => m.sender === 'bot');
    if (lastBot) voice.speak(lastBot.message, { language: lang });
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                           */
  /* ---------------------------------------------------------------- */

  const renderMessage = ({ item }) => {
    const mine = item.sender === 'me';
    const time = new Date(item.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return (
      <View style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
        <Text style={[styles.bubbleText, mine && styles.myBubbleText]}>{item.message}</Text>
        <Text style={[styles.timeText, mine && styles.myTimeText]}>{time}</Text>
      </View>
    );
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="arrow-back" size={moderateScale(24)} color="#fff" />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.title} numberOfLines={1}>{t('lalKitabAssistant.title')}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {typing ? t('chatSession.typing') : t('lalKitabAssistant.subtitle')}
        </Text>
      </View>
      {step === 'chat' && voice.canSpeak() && (
        <TouchableOpacity onPress={toggleSpeak} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons
            name={speakOn ? 'volume-high' : 'volume-mute-outline'}
            size={moderateScale(22)}
            color={speakOn ? '#88ffa8' : '#fff'}
          />
        </TouchableOpacity>
      )}
    </View>
  );

  if (step === 'intake') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ScrollView style={styles.intake} contentContainerStyle={styles.intakeContent}>
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>{t('lalKitabAssistant.introTitle')}</Text>
            <Text style={styles.introText}>{t('lalKitabAssistant.introText')}</Text>
            {/* Said plainly, before any details are typed. The feature's whole
                premise is that the remedy depends on the house, so "we need your
                exact time" is information, not an apology. */}
            <Text style={styles.introNote}>{t('lalKitabAssistant.whyExactTime')}</Text>
            <Text style={styles.aiNote}>{t('lalKitabAssistant.aiDisclosure')}</Text>
          </View>

          <BirthDetailsForm
            title={t('astro.enterBirthDetails')}
            showName={false}
            onValuesChange={setValues}
          />

          <TouchableOpacity
            style={[styles.startBtn, (!values.isComplete || starting) && styles.startBtnOff]}
            disabled={!values.isComplete || starting}
            onPress={start}>
            {starting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.startBtnText}>{t('lalKitabAssistant.startChat')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}

      {!hasChart && (
        <View style={styles.warnBar}>
          <Ionicons name="alert-circle-outline" size={moderateScale(16)} color="#7A5B00" />
          <Text style={styles.warnText}>{t('lalKitabAssistant.noChartYet')}</Text>
        </View>
      )}

      <ImageBackground
        source={{ uri: 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png' }}
        style={{ flex: 1 }}
        imageStyle={{ opacity: 0.15 }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />
      </ImageBackground>

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + verticalScale(12) }]}>
        {voice.canListen() && (
          <TouchableOpacity
            style={[styles.micBtn, listening && styles.micBtnOn]}
            onPress={toggleListening}>
            <Ionicons name={listening ? 'stop' : 'mic'} size={moderateScale(20)} color="#fff" />
          </TouchableOpacity>
        )}
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={listening ? t('lalKitabAssistant.listening') : t('lalKitabAssistant.messagePlaceholder')}
          placeholderTextColor="#aaa"
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={() => send()}>
          <Ionicons name="send" size={moderateScale(20)} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.AstroMaroon },

  header: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: { paddingRight: scale(10) },
  iconBtn: { paddingLeft: scale(10) },
  headerCenter: { flex: 1 },
  title: { color: '#fff', fontSize: moderateScale(16), fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: moderateScale(11.5), marginTop: verticalScale(1) },

  intake: { flex: 1, backgroundColor: COLORS.AstroSoftOrange },
  intakeContent: { padding: scale(15), paddingBottom: verticalScale(30) },
  introCard: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: scale(14),
    marginBottom: verticalScale(14),
    elevation: 1,
  },
  introTitle: { fontSize: moderateScale(15.5), fontWeight: '700', color: COLORS.AstroMaroon, marginBottom: verticalScale(6) },
  introText: { fontSize: moderateScale(13), color: '#444', lineHeight: moderateScale(19) },
  introNote: { fontSize: moderateScale(12.5), color: '#7A5B00', marginTop: verticalScale(8), lineHeight: moderateScale(18) },
  aiNote: { fontSize: moderateScale(11.5), color: '#777', marginTop: verticalScale(8), fontStyle: 'italic' },

  startBtn: {
    marginTop: verticalScale(16),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
  },
  startBtnOff: { opacity: 0.45 },
  startBtnText: { color: '#fff', fontSize: moderateScale(14.5), fontWeight: '700' },

  warnBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    backgroundColor: '#FFF3C4',
    paddingVertical: verticalScale(7),
    paddingHorizontal: scale(12),
  },
  warnText: { flex: 1, color: '#7A5B00', fontSize: moderateScale(11.5) },

  messagesList: { padding: scale(12), paddingBottom: verticalScale(20) },
  bubble: {
    maxWidth: '82%',
    borderRadius: moderateScale(14),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    marginBottom: verticalScale(8),
  },
  myBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.AstroMaroon, borderBottomRightRadius: moderateScale(4) },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: moderateScale(4) },
  bubbleText: { fontSize: moderateScale(13.5), color: '#222', lineHeight: moderateScale(20) },
  myBubbleText: { color: '#fff' },
  timeText: { fontSize: moderateScale(9.5), color: '#999', alignSelf: 'flex-end', marginTop: verticalScale(2) },
  myTimeText: { color: 'rgba(255,255,255,0.7)' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: scale(8),
    paddingHorizontal: scale(10),
    paddingTop: verticalScale(10),
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    maxHeight: verticalScale(110),
    backgroundColor: '#f2f2f2',
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(9),
    fontSize: moderateScale(13.5),
    color: '#222',
  },
  micBtn: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: '#8a6d3b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnOn: { backgroundColor: '#c0392b' },
  sendBtn: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
