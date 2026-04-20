import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  bg: '#0A0908', card: '#141311', primary: '#FFC107', primaryDark: '#422006',
  muted: '#27272A', mutedFg: '#A1A1AA', white: '#FFFFFF', text: '#E4E4E7',
  recording: '#EF4444', success: '#22C55E', secondaryFg: '#FDE68A',
};

type CallState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error' | 'paused';

export default function CallScreen() {
  const [state, setState] = useState<CallState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [duration, setDuration] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const router = useRouter();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActive = useRef(true);

  useEffect(() => {
    AsyncStorage.getItem('laila_auth_token').then(t => setAuthToken(t));
    durationTimer.current = setInterval(() => setDuration(d => d + 1), 1000);
    // Auto-start listening on mount — no initial tap needed (premium ChatGPT feel)
    const t = setTimeout(() => { if (isActive.current) startListening(); }, 500);
    return () => {
      isActive.current = false;
      cleanup();
      clearTimeout(t);
      if (durationTimer.current) clearInterval(durationTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = async () => {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {}
  };

  const authHeaders = () => authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Start listening ──────────────────
  const startListening = useCallback(async () => {
    if (!isActive.current) return;
    try {
      // Stop any playing audio
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { setState('error'); setResponse('Microphone permission required.'); return; }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setState('listening');
      setTranscript('');
    } catch (e) {
      setState('error');
      setResponse('Could not start listening.');
    }
  }, []);

  // ─── Stop listening & process ─────────
  const stopListening = useCallback(async () => {
    if (!recordingRef.current || !isActive.current) return;
    try {
      setState('thinking');
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) { setState('error'); setResponse('No audio recorded.'); return; }

      // Step 1: Transcribe
      const formData = new FormData();
      const ext = uri.split('.').pop() || 'm4a';
      formData.append('file', { uri, type: ext === 'webm' ? 'audio/webm' : 'audio/m4a', name: `call.${ext}` } as any);
      formData.append('language', '');

      const sttRes = await fetch(`${BACKEND_URL}/api/transcribe`, { method: 'POST', body: formData });
      if (!sttRes.ok) throw new Error('Transcription failed');
      const sttData = await sttRes.json();

      if (!sttData.text?.trim()) {
        setTranscript('(no speech detected)');
        if (isActive.current) startListening();
        return;
      }
      setTranscript(sttData.text);

      // Step 2: Chat
      const chatRes = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ message: sttData.text, conversation_id: conversationId, mode: 'voice_call' }),
      });
      if (!chatRes.ok) throw new Error('Chat failed');
      const chatData = await chatRes.json();
      setConversationId(chatData.conversation_id);
      const aiText = chatData.message.content;
      setResponse(aiText);
      setTurnCount(t => t + 1);

      // Step 3: TTS — limit to 500 chars for speed in voice mode
      setState('speaking');
      const ttsText = aiText.length > 500 ? aiText.substring(0, 497) + '...' : aiText;
      const preferredVoice = (await AsyncStorage.getItem('laila_tts_voice')) || 'nova';
      const ttsRes = await fetch(`${BACKEND_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ttsText, voice: preferredVoice, speed: 1.15 }),
      });
      if (!ttsRes.ok) throw new Error('TTS failed');
      const ttsData = await ttsRes.json();

      // Step 4: Play audio (slightly faster playback rate for snappier conversation)
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/mp3;base64,${ttsData.audio}` },
        { shouldPlay: true, rate: 1.05, shouldCorrectPitch: true }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          soundRef.current = null;
          sound.unloadAsync();
          // Auto-continue: start listening again unless paused
          if (isActive.current && !paused) startListening();
          else if (paused) setState('paused');
        }
      });
    } catch (e) {
      setState('error');
      setResponse('Something went wrong. Tap to try again.');
    }
  }, [conversationId, authToken, startListening, paused]);

  const endCall = async () => {
    isActive.current = false;
    await cleanup();
    router.back();
  };

  // Barge-in: tap avatar during LAILA speaking → interrupt and listen
  const bargeIn = async () => {
    if (state === 'speaking' && soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      } catch {}
      if (isActive.current) startListening();
    }
  };

  const togglePause = () => {
    setPaused(p => {
      const next = !p;
      if (next) {
        // Pause: stop any active mic recording
        if (recordingRef.current) {
          recordingRef.current.stopAndUnloadAsync().catch(() => {});
          recordingRef.current = null;
        }
        setState('paused');
      } else {
        // Resume: start listening
        setState('idle');
        if (isActive.current) setTimeout(() => startListening(), 200);
      }
      return next;
    });
  };

  const handleTap = () => {
    if (state === 'speaking') { bargeIn(); return; }
    if (state === 'listening') stopListening();
    else if (state === 'idle' || state === 'error' || state === 'paused') {
      if (paused) setPaused(false);
      startListening();
    }
  };

  const stateLabel: Record<CallState, string> = {
    idle: 'Getting ready...',
    listening: 'Listening — speak naturally',
    thinking: 'LAILA is thinking...',
    speaking: 'LAILA is speaking (tap to interrupt)',
    error: 'Tap to try again',
    paused: 'Paused — tap to resume',
  };

  const stateIcon: Record<CallState, string> = {
    idle: 'mic', listening: 'radio', thinking: 'hourglass', speaking: 'volume-high', error: 'refresh', paused: 'play',
  };

  const stateColor: Record<CallState, string> = {
    idle: COLORS.primary, listening: COLORS.recording, thinking: COLORS.secondaryFg, speaking: COLORS.success, error: COLORS.recording, paused: COLORS.mutedFg,
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.callInfo}>
          <Text style={s.callTitle}>Talking to LAILA</Text>
          <Text style={s.callTimer}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* Main area */}
      <View style={s.main}>
        {/* Avatar — tappable for barge-in (interrupt while LAILA speaking) */}
        <TouchableOpacity
          activeOpacity={state === 'speaking' ? 0.7 : 1}
          onPress={state === 'speaking' ? bargeIn : undefined}
          style={[s.avatarRing, { borderColor: stateColor[state] + '40' }]}
        >
          <View style={[s.avatar, state === 'listening' && s.avatarPulse, state === 'speaking' && s.avatarSpeaking, state === 'paused' && s.avatarPaused]}>
            <Text style={s.avatarText}>L</Text>
          </View>
        </TouchableOpacity>

        {/* State label */}
        <View style={[s.stateBadge, { backgroundColor: stateColor[state] + '15' }]}>
          <Ionicons name={stateIcon[state] as any} size={16} color={stateColor[state]} />
          <Text style={[s.stateText, { color: stateColor[state] }]}>{stateLabel[state]}</Text>
        </View>

        {/* Transcript */}
        {transcript ? (
          <View style={s.textCard}>
            <Text style={s.textLabel}>You said:</Text>
            <Text style={s.textContent} numberOfLines={3}>{transcript}</Text>
          </View>
        ) : null}

        {/* Response */}
        {response ? (
          <View style={[s.textCard, s.responseCard]}>
            <Text style={s.responseLabel}>LAILA:</Text>
            <Text style={s.textContent} numberOfLines={5}>{response}</Text>
          </View>
        ) : null}

        {/* Turn count */}
        {turnCount > 0 && (
          <Text style={s.turnCount}>{turnCount} exchange{turnCount > 1 ? 's' : ''}</Text>
        )}
      </View>

      {/* Controls — 3 buttons: Pause / End Call / Mic */}
      <View style={s.controls}>
        {/* Pause/Resume */}
        <TouchableOpacity testID="pause-btn" style={s.sideBtn} onPress={togglePause} activeOpacity={0.7}>
          <View style={s.sideBtnInner}>
            <Ionicons name={paused ? 'play' : 'pause'} size={22} color={COLORS.white} />
          </View>
          <Text style={s.sideBtnLabel}>{paused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>

        {/* End Call (big, red, labelled) */}
        <TouchableOpacity testID="end-call-btn" style={s.centerEnd} onPress={endCall} activeOpacity={0.85}>
          <View style={s.endBtn}>
            <Ionicons name="call" size={30} color={COLORS.white} style={{ transform: [{ rotate: '135deg' }] }} />
          </View>
          <Text style={s.endLabel}>End call</Text>
        </TouchableOpacity>

        {/* Mic action — only active when paused/idle/error */}
        <TouchableOpacity
          testID="call-action-btn"
          style={s.sideBtn}
          onPress={handleTap}
          disabled={state === 'thinking'}
          activeOpacity={0.7}
        >
          <View style={[s.sideBtnInner, { backgroundColor: stateColor[state] + '30', borderColor: stateColor[state] }]}>
            {state === 'thinking' ? (
              <ActivityIndicator size={22} color={stateColor[state]} />
            ) : (
              <Ionicons name={stateIcon[state] as any} size={22} color={stateColor[state]} />
            )}
          </View>
          <Text style={s.sideBtnLabel}>{state === 'listening' ? 'Stop' : state === 'speaking' ? 'Interrupt' : 'Speak'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 48 : 16, paddingBottom: 12, alignItems: 'center' },
  callInfo: { alignItems: 'center' },
  callTitle: { fontSize: 18, fontWeight: '600', color: COLORS.white },
  callTimer: { fontSize: 14, color: COLORS.mutedFg, marginTop: 4, fontVariant: ['tabular-nums'] },
  main: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  avatarRing: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarPulse: { backgroundColor: COLORS.recording },
  avatarSpeaking: { backgroundColor: COLORS.success },
  avatarPaused: { backgroundColor: COLORS.mutedFg },
  avatarText: { fontSize: 48, fontWeight: '800', color: COLORS.primaryDark },
  stateBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 24 },
  stateText: { fontSize: 14, fontWeight: '600' },
  textCard: { width: '100%', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.muted },
  responseCard: { borderColor: 'rgba(255, 193, 7, 0.15)' },
  textLabel: { fontSize: 11, color: COLORS.mutedFg, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  responseLabel: { fontSize: 11, color: COLORS.primary, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  textContent: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  turnCount: { fontSize: 12, color: COLORS.mutedFg, marginTop: 8 },
  controls: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingBottom: Platform.OS === 'ios' ? 48 : 32, paddingTop: 16, paddingHorizontal: 20 },
  sideBtn: { alignItems: 'center', gap: 6 },
  sideBtnInner: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.muted },
  sideBtnLabel: { fontSize: 11, color: COLORS.mutedFg, fontWeight: '600' },
  centerEnd: { alignItems: 'center', gap: 6 },
  endBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.recording, alignItems: 'center', justifyContent: 'center' },
  endLabel: { fontSize: 12, color: COLORS.white, fontWeight: '700' },
});
