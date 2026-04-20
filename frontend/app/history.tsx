import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Platform, SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const DEVICE_ID = 'device-' + Math.random().toString(36).substring(2, 10);

const COLORS = {
  bg: '#0A0908',
  card: '#141311',
  primary: '#FFC107',
  primaryDark: '#422006',
  secondary: '#211F1C',
  muted: '#27272A',
  mutedFg: '#A1A1AA',
  white: '#FFFFFF',
  text: '#E4E4E7',
  danger: '#EF4444',
};

const MODE_ICONS: Record<string, { icon: string; color: string }> = {
  chat: { icon: 'chatbubble-ellipses', color: '#FFC107' },
  work: { icon: 'briefcase', color: '#F59E0B' },
  study: { icon: 'school', color: '#3B82F6' },
  business: { icon: 'trending-up', color: '#10B981' },
  content: { icon: 'create', color: '#EC4899' },
  translate: { icon: 'language', color: '#06B6D4' },
};

type Conversation = {
  id: string;
  title: string;
  mode: string;
  last_message: string;
  created_at: string;
  updated_at: string;
};

export default function HistoryScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const router = useRouter();

  const openConversation = (convId: string) => {
    // Navigate to main chat screen with this conversation pre-loaded
    router.push({ pathname: '/', params: { cid: convId } });
  };

  const startNewChat = () => {
    router.push({ pathname: '/', params: { new: '1' } });
  };

  const loadConversations = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BACKEND_URL}/api/conversations?device_id=${DEVICE_ID}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (err) {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [])
  );

  const loadMessages = async (convId: string) => {
    if (expandedId === convId) {
      setExpandedId(null);
      setMessages([]);
      return;
    }
    setExpandedId(convId);
    setLoadingMessages(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/conversations/${convId}/messages`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const deleteConversation = (convId: string) => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${BACKEND_URL}/api/conversations/${convId}`, { method: 'DELETE' });
              setConversations(prev => prev.filter(c => c.id !== convId));
              if (expandedId === convId) {
                setExpandedId(null);
                setMessages([]);
              }
            } catch (err) {
              // silently fail
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const showItemMenu = (item: Conversation) => {
    Alert.alert(
      item.title || 'Chat',
      'Choose an action',
      [
        { text: (item as any).pinned ? 'Unpin' : 'Pin', onPress: () => togglePin(item) },
        { text: 'Rename', onPress: () => promptRename(item) },
        { text: 'Preview messages', onPress: () => loadMessages(item.id) },
        { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(item.id) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const togglePin = async (item: Conversation) => {
    await fetch(`${BACKEND_URL}/api/conversations/${item.id}?device_id=${DEVICE_ID}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !(item as any).pinned })
    }).catch(() => {});
    loadConversations();
  };

  const promptRename = (item: Conversation) => {
    if (Platform.OS === 'ios') {
      Alert.prompt('Rename chat', 'New title:', async (text?: string) => {
        if (!text || !text.trim()) return;
        await fetch(`${BACKEND_URL}/api/conversations/${item.id}?device_id=${DEVICE_ID}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: text.trim() })
        }).catch(() => {});
        loadConversations();
      }, 'plain-text', item.title);
    } else {
      Alert.alert('Rename', 'Tap and hold the chat in a future update for in-line rename. For now please use iOS or web.');
    }
  };

  const confirmDelete = (cid: string) => {
    Alert.alert('Delete chat?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteConversation(cid) },
    ]);
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const modeInfo = MODE_ICONS[item.mode] || MODE_ICONS.chat;
    const isExpanded = expandedId === item.id;
    const pinned = (item as any).pinned;

    return (
      <View>
        <TouchableOpacity
          testID={`history-item-${item.id}`}
          style={[styles.convCard, isExpanded && styles.convCardExpanded, pinned && styles.pinnedCard]}
          onPress={() => openConversation(item.id)}
          onLongPress={() => showItemMenu(item)}
          delayLongPress={350}
          activeOpacity={0.7}
        >
          <View style={[styles.convIcon, { backgroundColor: modeInfo.color + '20' }]}>
            <Ionicons name={modeInfo.icon as any} size={20} color={modeInfo.color} />
          </View>
          <View style={styles.convInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {pinned ? <Ionicons name="pin" size={12} color={COLORS.primary} /> : null}
              <Text style={styles.convTitle} numberOfLines={1}>{item.title}</Text>
            </View>
            <Text style={styles.convPreview} numberOfLines={1}>{item.last_message}</Text>
          </View>
          <View style={styles.convRight}>
            <Text style={styles.convTime}>{formatDate(item.updated_at)}</Text>
            <TouchableOpacity
              testID={`delete-conv-${item.id}`}
              onPress={() => deleteConversation(item.id)}
              style={styles.deleteBtn}
            >
              <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.messagesContainer}>
            {loadingMessages ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ padding: 16 }} />
            ) : (
              messages.map((msg, idx) => (
                <View
                  key={msg.id || idx}
                  style={[styles.msgItem, msg.role === 'user' ? styles.msgUser : styles.msgAi]}
                >
                  <Text style={styles.msgRole}>{msg.role === 'user' ? 'You' : 'LAILA'}</Text>
                  <Text style={styles.msgContent} numberOfLines={4}>{msg.content}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubbles-outline" size={64} color={COLORS.muted} />
      <Text style={styles.emptyTitle}>No conversations yet</Text>
      <Text style={styles.emptyDesc}>Start chatting with LAILA to see your history here</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Recent chats</Text>
          <Text style={styles.headerSub}>{conversations.length} conversations — tap to open, long-press to preview</Text>
        </View>
        <TouchableOpacity testID="projects-btn" onPress={() => router.push('/projects')} style={styles.folderBtn} activeOpacity={0.8}>
          <Ionicons name="folder-outline" size={18} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity testID="new-chat-btn" onPress={startNewChat} style={styles.newChatBtn} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color={COLORS.primaryDark} />
          <Text style={styles.newChatBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={conversations.length === 0 ? styles.emptyList : styles.listContent}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 44 : 12,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.muted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.mutedFg,
    marginTop: 2,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newChatBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  folderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  convCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: COLORS.muted,
  },
  convCardExpanded: {
    borderColor: COLORS.primary,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
  },
  pinnedCard: {
    borderColor: COLORS.primary + '60',
    backgroundColor: COLORS.card,
  },
  convIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  convInfo: {
    flex: 1,
  },
  convTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  convPreview: {
    fontSize: 12,
    color: COLORS.mutedFg,
  },
  convRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  convTime: {
    fontSize: 11,
    color: COLORS.mutedFg,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesContainer: {
    backgroundColor: COLORS.secondary,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 0.5,
    borderTopWidth: 0,
    borderColor: COLORS.primary,
  },
  msgItem: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  msgUser: {
    backgroundColor: COLORS.muted,
  },
  msgAi: {
    backgroundColor: 'rgba(255, 193, 7, 0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 193, 7, 0.1)',
  },
  msgRole: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  msgContent: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.mutedFg,
    textAlign: 'center',
    lineHeight: 20,
  },
});
