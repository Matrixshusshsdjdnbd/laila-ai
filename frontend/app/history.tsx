import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Platform, SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

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

  const renderConversation = ({ item }: { item: Conversation }) => {
    const modeInfo = MODE_ICONS[item.mode] || MODE_ICONS.chat;
    const isExpanded = expandedId === item.id;

    return (
      <View>
        <TouchableOpacity
          testID={`history-item-${item.id}`}
          style={[styles.convCard, isExpanded && styles.convCardExpanded]}
          onPress={() => loadMessages(item.id)}
          activeOpacity={0.7}
        >
          <View style={[styles.convIcon, { backgroundColor: modeInfo.color + '20' }]}>
            <Ionicons name={modeInfo.icon as any} size={20} color={modeInfo.color} />
          </View>
          <View style={styles.convInfo}>
            <Text style={styles.convTitle} numberOfLines={1}>{item.title}</Text>
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
        <Text style={styles.headerTitle}>History</Text>
        <Text style={styles.headerSub}>{conversations.length} conversations</Text>
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
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.mutedFg,
    marginTop: 2,
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
