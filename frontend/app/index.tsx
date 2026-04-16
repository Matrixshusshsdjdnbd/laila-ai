import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
  SafeAreaView, Keyboard, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const DEVICE_ID = 'device-' + Math.random().toString(36).substring(2, 10);

const COLORS = {
  bg: '#0A0908',
  card: '#141311',
  primary: '#FFC107',
  primaryDark: '#422006',
  secondary: '#211F1C',
  secondaryFg: '#FDE68A',
  muted: '#27272A',
  mutedFg: '#A1A1AA',
  white: '#FFFFFF',
  text: '#E4E4E7',
  aiBubble: '#15130F',
  userBubble: '#2C2520',
  recording: '#EF4444',
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

const QUICK_ACTIONS = [
  { id: 'work', icon: 'briefcase', label: 'Find Work', color: '#F59E0B' },
  { id: 'business', icon: 'trending-up', label: 'Start Business', color: '#10B981' },
  { id: 'translate', icon: 'language', label: 'Translate', color: '#3B82F6' },
  { id: 'chat', icon: 'chatbubble', label: 'Ask Anything', color: '#A855F7' },
];

const PRESET_PROMPTS = [
  { label: 'Write my CV', mode: 'work', prompt: 'Help me create a professional CV. Ask me the questions you need to build it.' },
  { label: 'Business ideas', mode: 'business', prompt: 'Give me 3 practical business ideas I can start today with my phone and small capital.' },
  { label: 'Help with homework', mode: 'study', prompt: 'I need help with my homework. I will send you the problem.' },
  { label: 'Translate to Wolof', mode: 'chat', prompt: 'I want to translate something to Wolof. What text should I give you?' },
];

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mode, setMode] = useState('chat');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendMessage = useCallback(async (text?: string, chatMode?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    Keyboard.dismiss();

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          conversation_id: conversationId,
          device_id: DEVICE_ID,
          mode: chatMode || mode,
        }),
      });

      if (!res.ok) throw new Error('Failed to get response');
      const data = await res.json();
      
      setConversationId(data.conversation_id);
      setMessages(prev => [...prev, data.message]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '-err',
        role: 'assistant',
        content: 'Sorry, I could not process your request. Please try again.',
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, conversationId, mode]);

  // ─── Voice Recording ──────────────────────────────────
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow microphone access to use voice input.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);

      durationInterval.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      setIsRecording(false);
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        Alert.alert('Error', 'No audio recorded.');
        return;
      }

      // Transcribe
      setIsTranscribing(true);
      await transcribeAudio(uri);
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setIsTranscribing(false);
    }
  };

  const transcribeAudio = async (uri: string) => {
    try {
      const formData = new FormData();
      
      // Determine the correct mime type and filename
      const fileExtension = uri.split('.').pop() || 'm4a';
      const mimeType = fileExtension === 'webm' ? 'audio/webm' : 
                       fileExtension === 'wav' ? 'audio/wav' : 
                       fileExtension === 'mp3' ? 'audio/mp3' : 'audio/m4a';
      
      formData.append('file', {
        uri: uri,
        type: mimeType,
        name: `recording.${fileExtension}`,
      } as any);
      formData.append('language', '');

      const res = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Transcription failed');
      }

      const data = await res.json();
      if (data.text && data.text.trim()) {
        setInput(prev => prev ? prev + ' ' + data.text.trim() : data.text.trim());
      } else {
        Alert.alert('No speech detected', 'Please try speaking louder or closer to the microphone.');
      }
    } catch (err: any) {
      console.error('Transcription error:', err);
      Alert.alert('Transcription failed', 'Could not convert speech to text. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleQuickAction = (actionId: string) => {
    const prompts: Record<string, string> = {
      work: 'I need help finding a job. What skills do I have and what opportunities are available for me?',
      business: 'Give me practical business ideas I can start with my phone and little money in Africa.',
      translate: 'I need to translate something. I can translate between Wolof, French, English, and Italian. What do you want to translate?',
      chat: 'Hello LAILA! What can you help me with today?',
    };
    setMode(actionId);
    sendMessage(prompts[actionId], actionId);
  };

  const handlePreset = (preset: typeof PRESET_PROMPTS[0]) => {
    setMode(preset.mode);
    sendMessage(preset.prompt, preset.mode);
  };

  const startNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setMode('chat');
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View
        testID={`message-${item.id}`}
        style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAi]}
      >
        {!isUser && (
          <View style={styles.avatarSmall}>
            <Text style={styles.avatarText}>L</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          {!isUser && <Text style={styles.aiLabel}>LAILA</Text>}
          <Text style={[styles.msgText, isUser && styles.userMsgText]}>{item.content}</Text>
        </View>
        {isUser && (
          <View style={styles.userAvatar}>
            <Ionicons name="person" size={14} color={COLORS.mutedFg} />
          </View>
        )}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoText}>L</Text>
      </View>
      <Text style={styles.emptyTitle}>LAILA AI</Text>
      <Text style={styles.emptySubtitle}>Africa Smart Assistant</Text>
      <Text style={styles.emptyDesc}>
        Your AI assistant for work, study, business, and daily life in Africa.
      </Text>

      <View style={styles.quickGrid}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.id}
            testID={`quick-action-${action.id}`}
            style={[styles.quickCard, { borderColor: action.color + '30' }]}
            onPress={() => handleQuickAction(action.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: action.color + '18' }]}>
              <Ionicons name={action.icon as any} size={22} color={action.color} />
            </View>
            <Text style={styles.quickLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.presetTitle}>Quick start</Text>
      <View style={styles.presetList}>
        {PRESET_PROMPTS.map((preset, idx) => (
          <TouchableOpacity
            key={idx}
            testID={`preset-${idx}`}
            style={styles.presetChip}
            onPress={() => handlePreset(preset)}
            activeOpacity={0.7}
          >
            <Text style={styles.presetText}>{preset.label}</Text>
            <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>L</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>LAILA AI</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.headerSub}>Online</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          testID="new-chat-btn"
          onPress={startNewChat}
          style={styles.newChatBtn}
        >
          <Ionicons name="add-circle-outline" size={28} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.msgList}
          ListEmptyComponent={renderEmpty}
          onContentSizeChange={() => {
            if (messages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          showsVerticalScrollIndicator={false}
        />

        {/* Loading indicator */}
        {loading && (
          <View style={styles.loadingRow}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarText}>L</Text>
            </View>
            <View style={styles.loadingBubble}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>LAILA is thinking...</Text>
            </View>
          </View>
        )}

        {/* Inline preset chips */}
        {messages.length > 0 && !loading && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.inlinePresets}
          >
            {PRESET_PROMPTS.map((preset, idx) => (
              <TouchableOpacity
                key={idx}
                testID={`inline-preset-${idx}`}
                style={styles.inlineChip}
                onPress={() => handlePreset(preset)}
              >
                <Text style={styles.inlineChipText}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Recording indicator */}
        {isRecording && (
          <View style={styles.recordingBar}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Recording... {formatDuration(recordingDuration)}</Text>
            <TouchableOpacity
              testID="stop-recording-btn"
              onPress={stopRecording}
              style={styles.stopRecBtn}
            >
              <Text style={styles.stopRecText}>Stop</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Transcribing indicator */}
        {isTranscribing && (
          <View style={styles.transcribingBar}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.transcribingText}>Converting speech to text...</Text>
          </View>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            testID="chat-input"
            style={styles.input}
            placeholder="Ask LAILA anything..."
            placeholderTextColor={COLORS.mutedFg}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          
          {/* Mic button - show when input is empty */}
          {!input.trim() && !loading && (
            <TouchableOpacity
              testID="mic-btn"
              style={[styles.micBtn, isRecording && styles.micBtnRecording]}
              onPress={toggleRecording}
              disabled={isTranscribing}
            >
              <Ionicons
                name={isRecording ? 'stop' : 'mic'}
                size={22}
                color={isRecording ? COLORS.white : COLORS.primary}
              />
            </TouchableOpacity>
          )}

          {/* Send button - show when input has text */}
          {(input.trim() || loading) && (
            <TouchableOpacity
              testID="send-message-btn"
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={() => sendMessage()}
              disabled={!input.trim() || loading}
            >
              <Ionicons name="arrow-up" size={20} color={COLORS.primaryDark} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 44 : 12,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.muted,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  headerSub: {
    fontSize: 12,
    color: '#22C55E',
  },
  newChatBtn: {
    padding: 8,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  msgList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  emptyTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 2,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.secondaryFg,
    marginBottom: 12,
    letterSpacing: 1,
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.mutedFg,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    width: '100%',
    marginBottom: 24,
  },
  quickCard: {
    width: '47%',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 0.5,
  },
  quickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  presetTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.mutedFg,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  presetList: {
    width: '100%',
    gap: 6,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderColor: COLORS.muted,
  },
  presetText: {
    fontSize: 14,
    color: COLORS.text,
  },
  // Messages
  msgRow: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '88%',
    alignItems: 'flex-end',
    gap: 8,
  },
  msgRowUser: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
  },
  msgRowAi: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  avatarSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  userAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '100%',
  },
  aiBubble: {
    backgroundColor: COLORS.aiBubble,
    borderRadius: 18,
    borderTopLeftRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 193, 7, 0.18)',
  },
  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderRadius: 18,
    borderTopRightRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  aiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  msgText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 23,
  },
  userMsgText: {
    color: COLORS.white,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.aiBubble,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 193, 7, 0.15)',
  },
  loadingText: {
    color: COLORS.mutedFg,
    fontSize: 13,
  },
  inlinePresets: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  inlineChip: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 0.5,
    borderColor: COLORS.muted,
  },
  inlineChipText: {
    fontSize: 12,
    color: COLORS.secondaryFg,
    fontWeight: '500',
  },
  // Recording
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(239, 68, 68, 0.3)',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.recording,
  },
  recordingText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.recording,
    fontWeight: '600',
  },
  stopRecBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.recording,
  },
  stopRecText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
  },
  transcribingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 193, 7, 0.06)',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255, 193, 7, 0.15)',
  },
  transcribingText: {
    fontSize: 13,
    color: COLORS.secondaryFg,
  },
  // Input area
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.muted,
    backgroundColor: COLORS.bg,
  },
  input: {
    flex: 1,
    backgroundColor: '#1A1918',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    color: COLORS.white,
    maxHeight: 120,
    borderWidth: 0.5,
    borderColor: COLORS.muted,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  micBtnRecording: {
    backgroundColor: COLORS.recording,
    borderColor: COLORS.recording,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
