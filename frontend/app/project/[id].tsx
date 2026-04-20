import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  SafeAreaView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  bg: '#0A0908', card: '#141311', primary: '#FFC107', primaryDark: '#422006',
  muted: '#27272A', mutedFg: '#A1A1AA', white: '#FFFFFF', text: '#E4E4E7',
};

export default function ProjectDetailScreen() {
  const { id, name: paramName, color: paramColor } = useLocalSearchParams<{ id: string; name?: string; color?: string }>();
  const router = useRouter();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const getHeaders = async () => {
    const token = await AsyncStorage.getItem('laila_auth_token');
    return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
  };
  const getDeviceId = async () => {
    let d = await AsyncStorage.getItem('laila_device_id');
    if (!d) { d = 'device-' + Math.random().toString(36).slice(2, 10); await AsyncStorage.setItem('laila_device_id', d); }
    return d;
  };

  const load = async () => {
    try {
      setLoading(true);
      const h = await getHeaders();
      const dev = await getDeviceId();
      const res = await fetch(`${BACKEND_URL}/api/projects/${id}/conversations?device_id=${dev}`, { headers: h });
      if (res.ok) { const d = await res.json(); setConversations(d.conversations || []); }
    } catch {} finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, [id]));

  const unassign = async (convId: string) => {
    const h = await getHeaders(); const dev = await getDeviceId();
    await fetch(`${BACKEND_URL}/api/conversations/${convId}?device_id=${dev}`, {
      method: 'PATCH', headers: h, body: JSON.stringify({ project_id: '' })
    });
    load();
  };

  const openConv = (cid: string) => router.push({ pathname: '/', params: { cid } });
  const startNewInProject = () => router.push({ pathname: '/', params: { new: '1', project_id: id } });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={[styles.iconBox, { backgroundColor: (paramColor as string) || COLORS.primary }]}>
          <Ionicons name="folder" size={18} color="rgba(0,0,0,0.5)" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{paramName || 'Project'}</Text>
          <Text style={styles.sub}>{conversations.length} {conversations.length === 1 ? 'chat' : 'chats'}</Text>
        </View>
        <TouchableOpacity testID="project-new-chat" onPress={startNewInProject} style={styles.newBtn}>
          <Ionicons name="add" size={18} color={COLORS.primaryDark} />
          <Text style={styles.newBtnT}>Chat</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={52} color={COLORS.mutedFg} />
          <Text style={styles.emptyT}>No chats in this project yet</Text>
          <Text style={styles.emptyS}>Start a conversation — it will be saved here automatically.</Text>
          <TouchableOpacity onPress={startNewInProject} style={styles.emptyBtn}>
            <Ionicons name="add-circle" size={18} color={COLORS.primaryDark} />
            <Text style={styles.emptyBtnT}>Start new chat in this project</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          removeClippedSubviews initialNumToRender={10} windowSize={6}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={() => openConv(item.id)}>
              <View style={styles.dot} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {item.pinned ? <Ionicons name="pin" size={12} color={COLORS.primary} /> : null}
                  <Text style={styles.rowT} numberOfLines={1}>{item.title || 'Untitled chat'}</Text>
                </View>
                {item.last_message ? <Text style={styles.rowS} numberOfLines={1}>{item.last_message}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => Alert.alert('Remove from project?', `"${item.title}" will stay in History but leave this project.`, [
                { text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => unassign(item.id) }
              ])} hitSlop={10} style={{ padding: 6 }}>
                <Ionicons name="remove-circle-outline" size={18} color={COLORS.mutedFg} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 44 : 12, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.muted },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.white },
  sub: { fontSize: 12, color: COLORS.mutedFg, marginTop: 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18 },
  newBtnT: { color: COLORS.primaryDark, fontWeight: '700', fontSize: 13 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  emptyT: { fontSize: 17, fontWeight: '700', color: COLORS.white, marginTop: 8 },
  emptyS: { fontSize: 13, color: COLORS.mutedFg, textAlign: 'center', lineHeight: 19 },
  emptyBtn: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22 },
  emptyBtnT: { color: COLORS.primaryDark, fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: COLORS.card, borderRadius: 12, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.muted },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  rowT: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  rowS: { fontSize: 12, color: COLORS.mutedFg, marginTop: 2 },
});
