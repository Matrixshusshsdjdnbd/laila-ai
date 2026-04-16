import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
  SafeAreaView, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  aiBubble: '#1A1714',
  userBubble: '#27272A',
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

const QUICK_ACTIONS = [
  { id: 'work', icon: 'briefcase', label: 'Work', color: '#F59E0B' },
  { id: 'study', icon: 'school', label: 'Study', color: '#3B82F6' },
  { id: 'translate', icon: 'language', label: 'Translate', color: '#10B981' },
  { id: 'business', icon: 'trending-up', label: 'Business', color: '#EF4444' },
];

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mode, setMode] = useState('chat');
  const flatListRef = useRef<FlatList>(null);

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

  const handleQuickAction = (actionId: string) => {
    const prompts: Record<string, string> = {
      work: 'Help me find job opportunities and create a professional CV.',
      study: 'I need help with my studies. Can you explain things step by step?',
      translate: 'I need help translating. What languages do you support?',
      business: 'Give me practical business ideas I can start with a phone.',
    };
    setMode(actionId === 'translate' ? 'chat' : actionId);
    sendMessage(prompts[actionId], actionId);
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
          <Text style={[styles.msgText, isUser && styles.userMsgText]}>{item.content}</Text>
        </View>
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
        Ask me anything! I can help with work, study, translation, and business ideas.
      </Text>
      <View style={styles.quickGrid}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.id}
            testID={`quick-action-${action.id}`}
            style={styles.quickCard}
            onPress={() => handleQuickAction(action.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: action.color + '20' }]}>
              <Ionicons name={action.icon as any} size={22} color={action.color} />
            </View>
            <Text style={styles.quickLabel}>{action.label}</Text>
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
            <Text style={styles.headerSub}>Smart Assistant</Text>
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
        {/* Messages */}
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
              <Text style={styles.loadingText}>Thinking...</Text>
            </View>
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
          <TouchableOpacity
            testID="send-message-btn"
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="arrow-up" size={20} color={COLORS.primaryDark} />
          </TouchableOpacity>
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
  headerSub: {
    fontSize: 12,
    color: COLORS.mutedFg,
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
    paddingHorizontal: 32,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.secondaryFg,
    marginBottom: 16,
    letterSpacing: 1,
  },
  emptyDesc: {
    fontSize: 15,
    color: COLORS.mutedFg,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    width: '100%',
  },
  quickCard: {
    width: '46%',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: COLORS.muted,
  },
  quickIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 12,
    maxWidth: '85%',
  },
  msgRowUser: {
    alignSelf: 'flex-end',
  },
  msgRowAi: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
    gap: 8,
  },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '100%',
  },
  aiBubble: {
    backgroundColor: COLORS.aiBubble,
    borderRadius: 20,
    borderTopLeftRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 193, 7, 0.15)',
  },
  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderRadius: 20,
    borderTopRightRadius: 4,
  },
  msgText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
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
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 193, 7, 0.15)',
  },
  loadingText: {
    color: COLORS.mutedFg,
    fontSize: 13,
  },
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
