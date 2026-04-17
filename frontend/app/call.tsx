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

type CallState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export default function CallScreen() {
  const [state, setState] = useState<CallState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [duration, setDuration] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const router = useRouter();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActive = useRef(true);

  useEffect(() => {
    AsyncStorage.getItem('laila_auth_token').then(t => setAuthToken(t));
    durationTimer.current = setInterval(() => setDuration(d => d + 1), 1000);
    return () => {
      isActive.current = false;
      cleanup();
      if (durationTimer.current) clearInterval(durationTimer.current);
    };
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
        body: JSON.stringify({ message: sttData.text, conversation_id: conversationId, mode: 'chat' }),
      });
      if (!chatRes.ok) throw new Error('Chat failed');
      const chatData = await chatRes.json();
      setConversationId(chatData.conversation_id);
      const aiText = chatData.message.content;
      setResponse(aiText);
      setTurnCount(t => t + 1);

      // Step 3: TTS
      setState('speaking');
      const ttsRes = await fetch(`${BACKEND_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText.substring(0, 4096), voice: 'nova' }),
      });
      if (!ttsRes.ok) throw new Error('TTS failed');
      const ttsData = await ttsRes.json();

      // Step 4: Play audio
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/mp3;base64,${ttsData.audio}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          soundRef.current = null;
          sound.unloadAsync();
          // Auto-continue: start listening again
          if (isActive.current) startListening();
        }
      });
    } catch (e) {
      setState('error');
      setResponse('Something went wrong. Tap to try again.');
    }
  }, [conversationId, authToken, startListening]);

  const endCall = async () => {
    isActive.current = false;
    await cleanup();
    router.back();
  };

  const handleTap = () => {
    if (state === 'listening') stopListening();
    else if (state === 'idle' || state === 'error') startListening();
  };

  const stateLabel: Record<CallState, string> = {
    idle: 'Tap to start talking',
    listening: 'Listening... Tap when done',
    thinking: 'LAILA is thinking...',
    speaking: 'LAILA is speaking...',
    error: 'Tap to try again',
  };

  const stateIcon: Record<CallState, string> = {
    idle: 'mic', listening: 'radio', thinking: 'hourglass', speaking: 'volume-high', error: 'refresh',
  };

  const stateColor: Record<CallState, string> = {
    idle: COLORS.primary, listening: COLORS.recording, thinking: COLORS.secondaryFg, speaking: COLORS.success, error: COLORS.recording,
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
        {/* Avatar */}
        <View style={[s.avatarRing, { borderColor: stateColor[state] + '40' }]}>
          <View style={[s.avatar, state === 'listening' && s.avatarPulse, state === 'speaking' && s.avatarSpeaking]}>
            <Text style={s.avatarText}>L</Text>
          </View>
        </View>

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

      {/* Controls */}
      <View style={s.controls}>
        {/* Main action button */}
        <TouchableOpacity
          testID="call-action-btn"
          style={[s.actionBtn, { backgroundColor: stateColor[state] + '20', borderColor: stateColor[state] }]}
          onPress={handleTap}
          disabled={state === 'thinking' || state === 'speaking'}
          activeOpacity={0.7}
        >
          {state === 'thinking' ? (
            <ActivityIndicator size={32} color={stateColor[state]} />
          ) : (
            <Ionicons name={stateIcon[state] as any} size={32} color={stateColor[state]} />
          )}
        </TouchableOpacity>

        {/* End call */}
        <TouchableOpacity testID="end-call-btn" style={s.endBtn} onPress={endCall}>
          <Ionicons name="close" size={28} color={COLORS.white} />
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
  avatarText: { fontSize: 48, fontWeight: '800', color: COLORS.primaryDark },
  stateBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 24 },
  stateText: { fontSize: 14, fontWeight: '600' },
  textCard: { width: '100%', backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.muted },
  responseCard: { borderColor: 'rgba(255, 193, 7, 0.15)' },
  textLabel: { fontSize: 11, color: COLORS.mutedFg, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  responseLabel: { fontSize: 11, color: COLORS.primary, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  textContent: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  turnCount: { fontSize: 12, color: COLORS.mutedFg, marginTop: 8 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32, paddingBottom: Platform.OS === 'ios' ? 48 : 32, paddingTop: 16 },
  actionBtn: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  endBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.recording, alignItems: 'center', justifyContent: 'center' },
});
