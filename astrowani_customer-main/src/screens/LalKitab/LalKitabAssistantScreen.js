// LalKitabAssistantScreen.js — Lal Kitab, read from your own chart.
//
// THE SHAPE OF THIS SCREEN, which is the thing to understand before changing it:
// the chat is NOT the product. The reading is. A person gives their birth
// details, we show them what is out of order in their chart as a list they can
// scan, and every item opens to the remedy Lal Kitab prescribes for exactly that.
// The assistant sits behind each item so they can ask about the one they are
// looking at. Three states, in that order:
//
//   'intake'   birth details  ->  POST /api/lal-kitab/chart
//   'findings' the problems, worst first, each tappable
//   'chat'     opened FROM a problem, and told which one
//
// A chat-first screen was built before this and was wrong: it put a blank text
// box in front of someone who does not yet know what to ask. The findings list
// answers "what is wrong with my chart" before they have to phrase it.
//
// REMEDIES ARE NEVER COMPOSED HERE. They arrive with the findings, exactly as
// JyotishamAstroAPI returned them for this chart, and are rendered as given.
//
// VOICE is utils/lalKitabVoice.js: Android's own on-device engines, free and
// presence-guarded, so a build without the native modules simply shows no mic
// and no speaker and everything else works.

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
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
  Easing,
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
import SeverityGauge from '../../components/lalKitab/SeverityGauge';
import KundliDiamond from '../../components/lalKitab/KundliDiamond';

// Longer than the backend's own 15s budget across its key chain and model list,
// so the server always answers "scripted" first and this only catches the server
// itself being slow.
const REQUEST_TIMEOUT_MS = 25000;

const uid = () => `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                       */
/* ------------------------------------------------------------------ */

/** The three dots while the astrologer is "typing". */
function TypingDots() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const loops = dots.map((d, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 160),
      Animated.timing(d, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(d, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.delay(240 - i * 160),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={[styles.bubble, styles.theirBubble, styles.typingBubble]}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[styles.typingDot, {
            opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
            transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -moderateScale(4)] }) }],
          }]}
        />
      ))}
    </View>
  );
}

const SEVERITY = {
  high: { bg: '#FDECEA', fg: '#A32B1C', dot: '#C0392B' },
  medium: { bg: '#FFF4DF', fg: '#8A5A14', dot: '#C9962C' },
  low: { bg: '#EAF4EC', fg: '#2B6B3A', dot: '#3C8C52' },
};

/**
 * One problem in the list.
 *
 * The shape follows what this market's astrology apps already do and what the
 * owner asked for: a titled finding, the reading itself in full, a severity
 * meter, and the two things a person wants next — the remedy, or a human.
 *
 * THE BODY IS NOT TRUNCATED. The reading is the thing they came for; clipping it
 * to two lines behind a chevron makes every card a door instead of an answer.
 * The remedy stays behind a tap because it is the payoff.
 */
function FindingCard({ item, index, onRemedies, onAsk, t }) {
  const tone = SEVERITY[item.severity] || SEVERITY.medium;
  const hasRemedies = (item.remedies || []).length > 0;
  return (
    <View style={styles.findingCard}>
      <View style={styles.findingHead}>
        <Text style={styles.findingNo}>{t('lalKitabAssistant.findingNo', { n: index + 1 })}</Text>
        <View style={[styles.sevPill, { backgroundColor: tone.bg }]}>
          <View style={[styles.sevDot, { backgroundColor: tone.dot }]} />
          <Text style={[styles.sevText, { color: tone.fg }]}>
            {item.severity === 'high' ? t('lalKitabAssistant.sevHigh') : t('lalKitabAssistant.sevMedium')}
          </Text>
        </View>
      </View>

      <Text style={styles.findingTitle}>{item.title}</Text>
      {!!item.subtitle && <Text style={styles.findingBody}>{item.subtitle}</Text>}

      {!!(item.points && item.points.length) && (
        <View style={styles.inlinePoints}>
          {item.points.slice(0, 3).map((p, i) => (
            <View key={i} style={styles.pointRow}>
              <View style={styles.pointDot} />
              <Text style={styles.pointText}>{p}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.gaugeRow}>
        <Text style={styles.gaugeLabel}>{t('lalKitabAssistant.severity')}</Text>
        <SeverityGauge severity={item.severity} size={moderateScale(72)} />
      </View>

      <View style={styles.actionRow}>
        {hasRemedies && (
          <TouchableOpacity style={styles.primaryAction} onPress={onRemedies} activeOpacity={0.88}>
            <Text style={styles.primaryActionText}>{t('lalKitabAssistant.viewRemedies')}</Text>
            <Ionicons name="leaf" size={moderateScale(15)} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.secondaryAction, !hasRemedies && { flex: 1 }]}
          onPress={onAsk}
          activeOpacity={0.88}>
          <Text style={styles.secondaryActionText}>{t('lalKitabAssistant.askAboutThis')}</Text>
          <Ionicons name="chatbubble-ellipses" size={moderateScale(15)} color={COLORS.AstroMaroon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

export default function LalKitabAssistantScreen({ navigation }) {
  const { t, language } = useContext(LanguageContext);
  const insets = useSafeAreaInsets();
  const lang = language === 'Hindi' ? 'hi' : 'en';

  const [step, setStep] = useState('intake'); // 'intake' | 'findings' | 'chat'
  const [values, setValues] = useState({ isComplete: false });
  const [busy, setBusy] = useState(false);

  const [findings, setFindings] = useState([]);
  const [counts, setCounts] = useState(null);
  const [houses, setHouses] = useState([]);
  const [openFinding, setOpenFinding] = useState(null); // the detail sheet

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [focus, setFocus] = useState(null); // the finding this chat is about

  const [speakOn, setSpeakOn] = useState(false);
  const [listening, setListening] = useState(false);

  const conversationIdRef = useRef(null);
  const sendingRef = useRef(false);
  const stopListeningRef = useRef(null);
  const listRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    if (stopListeningRef.current) stopListeningRef.current();
    voice.destroyVoice();
  }, []);

  const push = useCallback((sender, message) => {
    setMessages((prev) => prev.concat([{ id: uid(), sender, message, at: Date.now() }]));
  }, []);

  const maybeSpeak = useCallback((reply) => {
    if (!speakOn) return;
    voice.speak(reply, { language: lang });
  }, [speakOn, lang]);

  /* ---------------------------------------------------------------- */
  /* Read the chart                                                   */
  /* ---------------------------------------------------------------- */

  const readChart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await Instance.post(
        '/api/lal-kitab/chart',
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
      setFindings(Array.isArray(data?.findings) ? data.findings : []);
      setCounts(data?.counts || null);
      setHouses(Array.isArray(data?.houses) ? data.houses : []);
      setStep('findings');
      captureEvent('lal_kitab_chart_read', { findings: (data?.findings || []).length });
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
    if (mountedRef.current) setBusy(false);
  };

  /* ---------------------------------------------------------------- */
  /* Chat                                                             */
  /* ---------------------------------------------------------------- */

  const openChatFor = (finding) => {
    setFocus(finding || null);
    setOpenFinding(null);
    // An opening line that names what they tapped, so the chat never starts
    // blank. It is written here rather than asked of the model: it costs no
    // call, cannot drift, and is on screen before any network round trip.
    const opening = finding
      ? t('lalKitabAssistant.askOpening', { title: finding.title })
      : t('lalKitabAssistant.askOpeningGeneral');
    setMessages([{ id: uid(), sender: 'bot', message: opening, at: Date.now() }]);
    setStep('chat');
  };

  const send = async (raw) => {
    const bodyText = String(raw === undefined ? text : raw).trim();
    if (!bodyText) return;
    // Claimed before the first await: two taps of Send land together otherwise
    // and both spend a turn answering the same message.
    if (sendingRef.current) return;
    sendingRef.current = true;

    setText('');
    const history = messages.map((m) => ({ sender: m.sender === 'bot' ? 'bot' : 'me', message: m.message }));
    push('me', bodyText);
    setTyping(true);
    await voice.stopSpeaking();

    try {
      const { data } = await Instance.post(
        '/api/lal-kitab/chat/reply',
        {
          conversationId: conversationIdRef.current,
          message: bodyText,
          history,
          language: lang,
          focusId: focus ? focus.id : undefined,
        },
        { headers: await authHeaders(), timeout: REQUEST_TIMEOUT_MS },
      );
      if (!mountedRef.current) return;
      if (data?.conversationId) conversationIdRef.current = data.conversationId;
      if (data?.reply) {
        push('bot', data.reply);
        maybeSpeak(data.reply);
      } else {
        push('bot', t('lalKitabAssistant.fallbackReply'));
      }
    } catch (e) {
      if (mountedRef.current) {
        push('bot', e?.response?.status === 503
          ? t('lalKitabAssistant.notAvailable')
          : t('lalKitabAssistant.networkTrouble'));
      }
    }
    if (mountedRef.current) setTyping(false);
    sendingRef.current = false;
  };

  const toggleListening = async () => {
    if (listening) {
      if (stopListeningRef.current) await stopListeningRef.current();
      stopListeningRef.current = null;
      setListening(false);
      return;
    }
    // Ask at the tap, not on mount — the 2026-10-21 lesson, where a permission
    // dialog raced a watchdog armed at mount.
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
    if (!next) { await voice.stopSpeaking(); return; }
    const lastBot = [...messages].reverse().find((m) => m.sender === 'bot');
    if (lastBot) voice.speak(lastBot.message, { language: lang });
  };

  /* ---------------------------------------------------------------- */
  /* Header                                                           */
  /* ---------------------------------------------------------------- */

  const goBack = () => {
    if (step === 'chat') { setStep('findings'); setFocus(null); voice.stopSpeaking(); return; }
    if (step === 'findings') { setStep('intake'); return; }
    navigation.goBack();
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={goBack} style={styles.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="arrow-back" size={moderateScale(22)} color="#fff" />
      </TouchableOpacity>
      <View style={styles.headerBadge}>
        <Text style={styles.headerBadgeGlyph}>॥</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {step === 'chat' && focus ? focus.title : t('lalKitabAssistant.title')}
        </Text>
        <Text style={styles.headerSub} numberOfLines={1}>
          {typing ? t('chatSession.typing') : t('lalKitabAssistant.subtitle')}
        </Text>
      </View>
      {step === 'chat' && voice.canSpeak() && (
        <TouchableOpacity onPress={toggleSpeak} style={[styles.headerBtn, styles.headerRound, speakOn && styles.headerRoundOn]}>
          <Ionicons
            name={speakOn ? 'volume-high' : 'volume-mute-outline'}
            size={moderateScale(18)}
            color={speakOn ? COLORS.AstroMaroon : '#fff'}
          />
        </TouchableOpacity>
      )}
    </View>
  );

  /* ---------------------------------------------------------------- */
  /* 1. Intake                                                        */
  /* ---------------------------------------------------------------- */

  if (step === 'intake') {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        {header}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.intakeContent} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>{t('lalKitabAssistant.kicker')}</Text>
            <Text style={styles.heroTitle}>{t('lalKitabAssistant.introTitle')}</Text>
            <Text style={styles.heroText}>{t('lalKitabAssistant.introText')}</Text>

            <View style={styles.stepRow}>
              {[
                { icon: 'calendar-outline', label: t('lalKitabAssistant.step1') },
                { icon: 'search-outline', label: t('lalKitabAssistant.step2') },
                { icon: 'leaf-outline', label: t('lalKitabAssistant.step3') },
              ].map((s, i) => (
                <View key={i} style={styles.stepItem}>
                  <View style={styles.stepIcon}>
                    <Ionicons name={s.icon} size={moderateScale(16)} color={COLORS.AstroMaroon} />
                  </View>
                  <Text style={styles.stepLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.noteCard}>
            <View style={styles.noteBar} />
            <Ionicons name="time-outline" size={moderateScale(16)} color="#8A5A14" />
            <Text style={styles.noteText}>{t('lalKitabAssistant.whyExactTime')}</Text>
          </View>

          <View style={styles.formCard}>
            <BirthDetailsForm
              title={t('astro.enterBirthDetails')}
              showName={false}
              onValuesChange={setValues}
            />
          </View>

          <TouchableOpacity
            style={[styles.cta, (!values.isComplete || busy) && styles.ctaOff]}
            disabled={!values.isComplete || busy}
            onPress={readChart}
            activeOpacity={0.88}>
            {busy ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="sparkles" size={moderateScale(17)} color="#fff" />
                <Text style={styles.ctaText}>{t('lalKitabAssistant.readChart')}</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.aiNote}>{t('lalKitabAssistant.aiDisclosure')}</Text>
        </ScrollView>
      </View>
    );
  }

  /* ---------------------------------------------------------------- */
  /* 2. Findings                                                      */
  /* ---------------------------------------------------------------- */

  if (step === 'findings') {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        {header}
        <FlatList
          data={findings}
          keyExtractor={(x) => x.id}
          style={{ flex: 1 }}
          contentContainerStyle={styles.findingsContent}
          ListHeaderComponent={(
            <View>
              <View style={styles.chartCard}>
                <Text style={styles.chartLabel}>{t('lalKitabAssistant.yourChart')}</Text>
                <KundliDiamond houses={houses} size={moderateScale(250)} />
              </View>

              <View style={styles.summaryCard}>
                <View style={styles.statRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{findings.length}</Text>
                    <Text style={styles.statLabel}>{t('lalKitabAssistant.statFindings')}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{(counts && counts.debts) || 0}</Text>
                    <Text style={styles.statLabel}>{t('lalKitabAssistant.statDebts')}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{(counts && counts.remedies) || 0}</Text>
                    <Text style={styles.statLabel}>{t('lalKitabAssistant.statRemedies')}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.sectionLabel}>{t('lalKitabAssistant.whatToFix')}</Text>
            </View>
          )}
          renderItem={({ item, index }) => (
            <FindingCard
              item={item}
              index={index}
              t={t}
              onRemedies={() => setOpenFinding(item)}
              onAsk={() => openChatFor(item)}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle-outline" size={moderateScale(40)} color="#3C8C52" />
              <Text style={styles.emptyTitle}>{t('lalKitabAssistant.nothingTitle')}</Text>
              <Text style={styles.emptyText}>{t('lalKitabAssistant.nothingText')}</Text>
            </View>
          )}
          ListFooterComponent={(
            <TouchableOpacity style={styles.askAnything} onPress={() => openChatFor(null)} activeOpacity={0.88}>
              <Ionicons name="chatbubbles-outline" size={moderateScale(18)} color={COLORS.AstroMaroon} />
              <Text style={styles.askAnythingText}>{t('lalKitabAssistant.askAnything')}</Text>
              <Ionicons name="chevron-forward" size={moderateScale(16)} color={COLORS.AstroMaroon} />
            </TouchableOpacity>
          )}
        />

        {/* The remedy sheet. The remedies are already on the device with the
            findings, so opening this is instant and costs no request. */}
        <Modal visible={!!openFinding} transparent animationType="slide" onRequestClose={() => setOpenFinding(null)}>
          <View style={styles.sheetBackdrop}>
            <View style={[styles.sheet, { paddingBottom: insets.bottom + verticalScale(14) }]}>
              <View style={styles.sheetHandle} />
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>{openFinding ? openFinding.title : ''}</Text>
                {!!(openFinding && openFinding.subtitle) && (
                  <Text style={styles.sheetSub}>{openFinding.subtitle}</Text>
                )}

                {!!(openFinding && openFinding.points && openFinding.points.length) && (
                  <View style={styles.pointsBox}>
                    {openFinding.points.map((p, i) => (
                      <View key={i} style={styles.pointRow}>
                        <View style={styles.pointDot} />
                        <Text style={styles.pointText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.remedyHeader}>
                  <Ionicons name="leaf" size={moderateScale(16)} color={COLORS.AstroMaroon} />
                  <Text style={styles.remedyHeaderText}>{t('lalKitabAssistant.theRemedy')}</Text>
                </View>
                {(openFinding ? openFinding.remedies : []).map((r, i) => (
                  <View key={i} style={styles.remedyCard}>
                    <Text style={styles.remedyNum}>{i + 1}</Text>
                    <Text style={styles.remedyText}>{r}</Text>
                  </View>
                ))}

                <Text style={styles.sourceNote}>{t('lalKitabAssistant.sourceNote')}</Text>
              </ScrollView>

              <TouchableOpacity style={styles.cta} onPress={() => openChatFor(openFinding)} activeOpacity={0.88}>
                <Ionicons name="chatbubble-ellipses" size={moderateScale(17)} color="#fff" />
                <Text style={styles.ctaText}>{t('lalKitabAssistant.askAboutThis')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetClose} onPress={() => setOpenFinding(null)}>
                <Text style={styles.sheetCloseText}>{t('lalKitabAssistant.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  /* ---------------------------------------------------------------- */
  /* 3. Chat                                                          */
  /* ---------------------------------------------------------------- */

  const suggestions = focus
    ? [t('lalKitabAssistant.sugHowLong'), t('lalKitabAssistant.sugWhen'), t('lalKitabAssistant.sugWhy')]
    : [t('lalKitabAssistant.sugBiggest'), t('lalKitabAssistant.sugMoney'), t('lalKitabAssistant.sugMarriage')];

  return (
    <KeyboardAvoidingView
      style={[styles.page, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.sender === 'me';
          return (
            <View style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
              <Text style={[styles.bubbleText, mine && styles.myBubbleText]}>{item.message}</Text>
              <Text style={[styles.bubbleTime, mine && styles.myBubbleTime]}>
                {new Date(item.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
        ListFooterComponent={typing ? <TypingDots /> : null}
      />

      {/* Only while the conversation is young: once they are talking, chips are
          clutter in the way of the keyboard. */}
      {messages.length <= 1 && !typing && (
        <View style={styles.chipRow}>
          {suggestions.map((s, i) => (
            <TouchableOpacity key={i} style={styles.chip} onPress={() => send(s)} activeOpacity={0.85}>
              <Text style={styles.chipText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + verticalScale(10) }]}>
        <View style={[styles.inputPill, listening && styles.inputPillListening]}>
          {voice.canListen() && (
            <TouchableOpacity onPress={toggleListening} style={styles.micBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons
                name={listening ? 'stop-circle' : 'mic-outline'}
                size={moderateScale(21)}
                color={listening ? '#C0392B' : COLORS.AstroMaroon}
              />
            </TouchableOpacity>
          )}
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={listening ? t('lalKitabAssistant.listening') : t('lalKitabAssistant.messagePlaceholder')}
            placeholderTextColor="#A99687"
            multiline
          />
        </View>
        <TouchableOpacity style={[styles.sendBtn, !text.trim() && styles.sendBtnOff]} onPress={() => send()} activeOpacity={0.85}>
          <Ionicons name="send" size={moderateScale(18)} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------ */

const CARD_SHADOW = {
  elevation: 2,
  shadowColor: '#3A1F13',
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.AstroSoftOrange },

  /* header */
  header: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  headerBtn: { padding: scale(2) },
  headerRound: {
    width: moderateScale(34),
    height: moderateScale(34),
    borderRadius: moderateScale(17),
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRoundOn: { backgroundColor: '#FFE9A8' },
  headerBadge: {
    width: moderateScale(34),
    height: moderateScale(34),
    borderRadius: moderateScale(17),
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeGlyph: { color: '#FFE9A8', fontSize: moderateScale(17), fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: moderateScale(15.5), fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.72)', fontSize: moderateScale(11), marginTop: verticalScale(1) },

  /* intake */
  intakeContent: { padding: scale(14), paddingBottom: verticalScale(34) },
  hero: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(18),
    padding: scale(16),
    ...CARD_SHADOW,
  },
  heroKicker: {
    fontSize: moderateScale(10.5),
    letterSpacing: 1.2,
    fontWeight: '700',
    color: '#B07A2A',
    marginBottom: verticalScale(5),
  },
  heroTitle: { fontSize: moderateScale(19), fontWeight: '800', color: COLORS.AstroMaroon, lineHeight: moderateScale(25) },
  heroText: { fontSize: moderateScale(13), color: '#5C4A3E', lineHeight: moderateScale(20), marginTop: verticalScale(7) },

  stepRow: { flexDirection: 'row', marginTop: verticalScale(14), gap: scale(8) },
  stepItem: { flex: 1, alignItems: 'center' },
  stepIcon: {
    width: moderateScale(34),
    height: moderateScale(34),
    borderRadius: moderateScale(17),
    backgroundColor: '#FBEEDD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(5),
  },
  stepLabel: { fontSize: moderateScale(10.5), color: '#6B584A', textAlign: 'center', lineHeight: moderateScale(14) },

  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scale(8),
    backgroundColor: '#FFF6E6',
    borderRadius: moderateScale(12),
    padding: scale(12),
    marginTop: verticalScale(12),
    overflow: 'hidden',
  },
  noteBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: scale(4), backgroundColor: '#E0A93A' },
  noteText: { flex: 1, fontSize: moderateScale(11.5), color: '#7A5B14', lineHeight: moderateScale(17) },

  formCard: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(18),
    padding: scale(6),
    marginTop: verticalScale(12),
    ...CARD_SHADOW,
  },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(14),
    paddingVertical: verticalScale(15),
    marginTop: verticalScale(16),
    elevation: 3,
    shadowColor: COLORS.AstroMaroon,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaOff: { opacity: 0.4, elevation: 0 },
  ctaText: { color: '#fff', fontSize: moderateScale(14.5), fontWeight: '700' },

  aiNote: {
    fontSize: moderateScale(10.5),
    color: '#8A7A6D',
    textAlign: 'center',
    marginTop: verticalScale(14),
    lineHeight: moderateScale(15),
  },

  /* findings */
  findingsContent: { padding: scale(14), paddingBottom: verticalScale(30) },
  summaryCard: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(16),
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(10),
    marginTop: verticalScale(12),
    ...CARD_SHADOW,
  },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { color: '#fff', fontSize: moderateScale(22), fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: moderateScale(10), marginTop: verticalScale(2), textAlign: 'center' },
  statDivider: { width: 1, height: verticalScale(28), backgroundColor: 'rgba(255,255,255,0.18)' },

  sectionLabel: {
    fontSize: moderateScale(13),
    fontWeight: '800',
    color: COLORS.AstroMaroon,
    marginTop: verticalScale(18),
    marginBottom: verticalScale(8),
  },

  chartCard: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(18),
    padding: scale(14),
    alignItems: 'center',
    ...CARD_SHADOW,
  },
  chartLabel: {
    fontSize: moderateScale(11),
    fontWeight: '800',
    letterSpacing: 1,
    color: '#B07A2A',
    marginBottom: verticalScale(10),
  },

  findingCard: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(16),
    padding: scale(14),
    marginBottom: verticalScale(12),
    ...CARD_SHADOW,
  },
  findingHead: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(6) },
  findingNo: { flex: 1, fontSize: moderateScale(11.5), fontWeight: '800', color: '#B07A2A', letterSpacing: 0.3 },
  sevPill: { flexDirection: 'row', alignItems: 'center', gap: scale(4), paddingHorizontal: scale(8), paddingVertical: verticalScale(3), borderRadius: moderateScale(9) },
  sevDot: { width: moderateScale(5), height: moderateScale(5), borderRadius: moderateScale(3) },
  sevText: { fontSize: moderateScale(9.5), fontWeight: '700' },
  findingTitle: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.AstroMaroon, marginBottom: verticalScale(5) },
  findingBody: { fontSize: moderateScale(12.5), color: '#4A3A2E', lineHeight: moderateScale(20) },
  inlinePoints: { marginTop: verticalScale(9) },

  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    marginTop: verticalScale(10),
    marginBottom: verticalScale(4),
  },
  gaugeLabel: { fontSize: moderateScale(12), fontWeight: '700', color: '#6B584A' },

  actionRow: { flexDirection: 'row', gap: scale(9), marginTop: verticalScale(8) },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(22),
    paddingVertical: verticalScale(11),
  },
  primaryActionText: { color: '#fff', fontSize: moderateScale(12.5), fontWeight: '700' },
  secondaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
    backgroundColor: '#FBEEDD',
    borderWidth: 1,
    borderColor: '#EBD6BA',
    borderRadius: moderateScale(22),
    paddingVertical: verticalScale(11),
  },
  secondaryActionText: { color: COLORS.AstroMaroon, fontSize: moderateScale(12.5), fontWeight: '700' },

  emptyCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: moderateScale(16), padding: scale(22), ...CARD_SHADOW },
  emptyTitle: { fontSize: moderateScale(15), fontWeight: '700', color: '#2B6B3A', marginTop: verticalScale(8) },
  emptyText: { fontSize: moderateScale(12), color: '#6B584A', textAlign: 'center', marginTop: verticalScale(5), lineHeight: moderateScale(18) },

  askAnything: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(9),
    backgroundColor: '#FBEEDD',
    borderWidth: 1,
    borderColor: '#EBD6BA',
    borderRadius: moderateScale(14),
    padding: scale(14),
    marginTop: verticalScale(6),
  },
  askAnythingText: { flex: 1, fontSize: moderateScale(13), fontWeight: '700', color: COLORS.AstroMaroon },

  /* remedy sheet */
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(30,16,9,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.AstroSoftOrange,
    borderTopLeftRadius: moderateScale(22),
    borderTopRightRadius: moderateScale(22),
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(10),
    maxHeight: '86%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: scale(42),
    height: verticalScale(4),
    borderRadius: 4,
    backgroundColor: '#C9B3A0',
    marginBottom: verticalScale(12),
  },
  sheetTitle: { fontSize: moderateScale(18), fontWeight: '800', color: COLORS.AstroMaroon },
  sheetSub: { fontSize: moderateScale(12.5), color: '#5C4A3E', lineHeight: moderateScale(19), marginTop: verticalScale(6) },

  pointsBox: { backgroundColor: '#fff', borderRadius: moderateScale(12), padding: scale(12), marginTop: verticalScale(12), ...CARD_SHADOW },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: scale(8), marginBottom: verticalScale(6) },
  pointDot: { width: moderateScale(5), height: moderateScale(5), borderRadius: 3, backgroundColor: '#C9962C', marginTop: verticalScale(6) },
  pointText: { flex: 1, fontSize: moderateScale(12), color: '#5C4A3E', lineHeight: moderateScale(18) },

  remedyHeader: { flexDirection: 'row', alignItems: 'center', gap: scale(6), marginTop: verticalScale(18), marginBottom: verticalScale(8) },
  remedyHeaderText: { fontSize: moderateScale(13), fontWeight: '800', color: COLORS.AstroMaroon },
  remedyCard: {
    flexDirection: 'row',
    gap: scale(10),
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: scale(13),
    marginBottom: verticalScale(8),
    borderLeftWidth: scale(3),
    borderLeftColor: '#C9962C',
  },
  remedyNum: { fontSize: moderateScale(12), fontWeight: '800', color: '#C9962C' },
  remedyText: { flex: 1, fontSize: moderateScale(12.5), color: '#3A2318', lineHeight: moderateScale(19) },
  sourceNote: { fontSize: moderateScale(10.5), color: '#8A7A6D', fontStyle: 'italic', marginTop: verticalScale(6), marginBottom: verticalScale(10) },
  sheetClose: { alignItems: 'center', paddingVertical: verticalScale(10) },
  sheetCloseText: { fontSize: moderateScale(12.5), color: '#6B584A', fontWeight: '600' },

  /* chat */
  messagesList: { padding: scale(13), paddingBottom: verticalScale(14) },
  bubble: {
    maxWidth: '84%',
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(13),
    paddingVertical: verticalScale(9),
    marginBottom: verticalScale(9),
    ...CARD_SHADOW,
  },
  myBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.AstroMaroon, borderBottomRightRadius: moderateScale(5) },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: moderateScale(5) },
  bubbleText: { fontSize: moderateScale(13.5), color: '#3A2318', lineHeight: moderateScale(20) },
  myBubbleText: { color: '#fff' },
  bubbleTime: { fontSize: moderateScale(9), color: '#A99687', alignSelf: 'flex-end', marginTop: verticalScale(3) },
  myBubbleTime: { color: 'rgba(255,255,255,0.65)' },

  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: scale(5), paddingVertical: verticalScale(13) },
  typingDot: { width: moderateScale(7), height: moderateScale(7), borderRadius: moderateScale(4), backgroundColor: COLORS.AstroMaroon },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(7), paddingHorizontal: scale(13), paddingBottom: verticalScale(8) },
  chip: {
    backgroundColor: '#FBEEDD',
    borderWidth: 1,
    borderColor: '#EBD6BA',
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(7),
  },
  chipText: { fontSize: moderateScale(11.5), color: COLORS.AstroMaroon, fontWeight: '600' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: scale(8),
    paddingHorizontal: scale(11),
    paddingTop: verticalScale(9),
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#EFE2D4',
  },
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(7),
    backgroundColor: '#F6EFE7',
    borderRadius: moderateScale(22),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(3),
    borderWidth: 1,
    borderColor: '#EFE2D4',
  },
  inputPillListening: { borderColor: '#E8B4AC', backgroundColor: '#FDF1EF' },
  micBtn: { padding: scale(2) },
  input: {
    flex: 1,
    maxHeight: verticalScale(104),
    fontSize: moderateScale(13.5),
    color: '#3A2318',
    paddingVertical: verticalScale(8),
  },
  sendBtn: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(21),
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  sendBtnOff: { opacity: 0.45, elevation: 0 },
});
