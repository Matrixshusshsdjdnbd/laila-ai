import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  SafeAreaView, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  bg: '#0A0908', card: '#141311', primary: '#FFC107', primaryDark: '#422006',
  muted: '#27272A', mutedFg: '#A1A1AA', white: '#FFFFFF', text: '#E4E4E7',
  secondaryFg: '#FDE68A', danger: '#EF4444', success: '#22C55E',
};

const LANGUAGES = [
  { code: 'auto', name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'wo', name: 'Wolof' },
];

export default function SettingsScreen() {
  const [settings, setSettings] = useState({ preferred_language: 'auto', voice_enabled: true, tts_enabled: true, memory_enabled: true, theme: 'dark' });
  const [memories, setMemories] = useState<Record<string, string>>({});
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  const getHeaders = async () => {
    const token = await AsyncStorage.getItem('laila_auth_token');
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  };

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  const loadAll = async () => {
    setLoading(true);
    try {
      const h = await getHeaders();
      const [sRes, mRes, uRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/settings`, { headers: h }),
        fetch(`${BACKEND_URL}/api/memory`, { headers: h }),
        fetch(`${BACKEND_URL}/api/auth/me`, { headers: h }),
      ]);
      if (sRes.ok) setSettings(await sRes.json());
      if (mRes.ok) { const d = await mRes.json(); setMemories(d.memories || {}); }
      if (uRes.ok) setUser(await uRes.json());
    } catch {} finally { setLoading(false); }
  };

  const updateSetting = async (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    const h = await getHeaders();
    await fetch(`${BACKEND_URL}/api/settings`, { method: 'PUT', headers: h, body: JSON.stringify({ [key]: value }) }).catch(() => {});
  };

  const clearMemory = () => {
    Alert.alert('Clear Memory', 'LAILA will forget everything about you. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        const h = await getHeaders();
        await fetch(`${BACKEND_URL}/api/memory`, { method: 'DELETE', headers: h });
        setMemories({});
      }},
    ]);
  };

  const clearHistory = () => {
    Alert.alert('Clear All Chats', 'All conversations will be permanently deleted. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete All', style: 'destructive', onPress: async () => {
        const h = await getHeaders();
        await fetch(`${BACKEND_URL}/api/settings/history`, { method: 'DELETE', headers: h });
        Alert.alert('Done', 'All conversations have been deleted.');
      }},
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        const h = await getHeaders();
        await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', headers: h });
        await AsyncStorage.multiRemove(['laila_auth_token', 'laila_auth_user']);
        // Force reload by clearing onboarding too
        Alert.alert('Logged Out', 'Please restart the app to login again.');
      }},
    ]);
  };

  if (loading) return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} /></SafeAreaView>;

  const memKeys = Object.keys(memories);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <View style={styles.accountRow}>
            <View style={styles.avatarCircle}><Text style={styles.avatarLetter}>{(user?.name || 'U')[0].toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountName}>{user?.name || 'User'}</Text>
              <Text style={styles.accountEmail}>{user?.email || ''}</Text>
            </View>
            <View style={[styles.tierBadge, user?.tier === 'premium' ? styles.tierPremium : styles.tierFree]}>
              <Text style={[styles.tierText, user?.tier === 'premium' && styles.tierTextPremium]}>
                {user?.tier === 'premium' ? 'PREMIUM' : 'FREE'}
              </Text>
            </View>
          </View>
          {user?.tier === 'free' && (
            <TouchableOpacity testID="upgrade-premium-btn" style={styles.upgradeBtn} onPress={() => router.push('/premium')}>
              <Ionicons name="star" size={16} color={COLORS.primaryDark} />
              <Text style={styles.upgradeBtnText}>Upgrade to Premium</Text>
            </TouchableOpacity>
          )}
          {user?.tier === 'free' && (
            <Text style={styles.usageText}>{user?.daily_messages || 0}/{user?.daily_limit || 20} messages today</Text>
          )}
        </View>

        {/* Language */}
        <Text style={styles.sectionTitle}>Language</Text>
        <View style={styles.card}>
          <Text style={styles.settingLabel}>Preferred Language</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll}>
            {LANGUAGES.map(lang => (
              <TouchableOpacity key={lang.code} testID={`lang-${lang.code}`}
                style={[styles.langChip, settings.preferred_language === lang.code && styles.langChipActive]}
                onPress={() => updateSetting('preferred_language', lang.code)}>
                <Text style={[styles.langText, settings.preferred_language === lang.code && styles.langTextActive]}>{lang.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Voice */}
        <Text style={styles.sectionTitle}>Voice</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}><Text style={styles.settingLabel}>Voice Input (Microphone)</Text><Text style={styles.settingDesc}>Speak instead of typing</Text></View>
            <Switch testID="toggle-voice" value={settings.voice_enabled} onValueChange={v => updateSetting('voice_enabled', v)} trackColor={{ false: COLORS.muted, true: COLORS.primary + '60' }} thumbColor={settings.voice_enabled ? COLORS.primary : COLORS.mutedFg} />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}><Text style={styles.settingLabel}>Text-to-Speech</Text><Text style={styles.settingDesc}>Listen to LAILA's responses</Text></View>
            <Switch testID="toggle-tts" value={settings.tts_enabled} onValueChange={v => updateSetting('tts_enabled', v)} trackColor={{ false: COLORS.muted, true: COLORS.primary + '60' }} thumbColor={settings.tts_enabled ? COLORS.primary : COLORS.mutedFg} />
          </View>
        </View>

        {/* Memory */}
        <Text style={styles.sectionTitle}>Memory</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}><Text style={styles.settingLabel}>Smart Memory</Text><Text style={styles.settingDesc}>LAILA remembers your preferences</Text></View>
            <Switch testID="toggle-memory" value={settings.memory_enabled} onValueChange={v => updateSetting('memory_enabled', v)} trackColor={{ false: COLORS.muted, true: COLORS.primary + '60' }} thumbColor={settings.memory_enabled ? COLORS.primary : COLORS.mutedFg} />
          </View>
          {memKeys.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.memTitle}>What LAILA knows about you:</Text>
              {memKeys.map(k => (
                <View key={k} style={styles.memRow}>
                  <Ionicons name="bookmark" size={14} color={COLORS.primary} />
                  <Text style={styles.memKey}>{k}:</Text>
                  <Text style={styles.memValue}>{memories[k]}</Text>
                </View>
              ))}
            </>
          )}
          <TouchableOpacity testID="clear-memory-btn" style={styles.dangerBtn} onPress={clearMemory}>
            <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
            <Text style={styles.dangerBtnText}>Clear All Memory</Text>
          </TouchableOpacity>
        </View>

        {/* Data */}
        <Text style={styles.sectionTitle}>Data</Text>
        <View style={styles.card}>
          <TouchableOpacity testID="clear-history-btn" style={styles.dangerBtn} onPress={clearHistory}>
            <Ionicons name="chatbubbles-outline" size={16} color={COLORS.danger} />
            <Text style={styles.dangerBtnText}>Delete All Conversations</Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity testID="logout-btn" style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>LAILA AI v2.0 · Created by Bathie Sarr</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 44 : 12, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.muted },
  headerTitle: { fontSize: 24, fontWeight: '700', color: COLORS.white },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.mutedFg, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: COLORS.muted },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 18, fontWeight: '800', color: COLORS.primaryDark },
  accountName: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  accountEmail: { fontSize: 13, color: COLORS.mutedFg, marginTop: 1 },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tierFree: { backgroundColor: COLORS.muted },
  tierPremium: { backgroundColor: COLORS.primary + '20' },
  tierText: { fontSize: 11, fontWeight: '800', color: COLORS.mutedFg, letterSpacing: 0.5 },
  tierTextPremium: { color: COLORS.primary },
  usageText: { fontSize: 12, color: COLORS.mutedFg, marginTop: 8 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, marginTop: 10 },
  upgradeBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primaryDark },
  settingLabel: { fontSize: 15, fontWeight: '600', color: COLORS.white },
  settingDesc: { fontSize: 12, color: COLORS.mutedFg, marginTop: 2 },
  langScroll: { marginTop: 10 },
  langChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.bg, marginRight: 8, borderWidth: 1, borderColor: COLORS.muted },
  langChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  langText: { fontSize: 13, color: COLORS.mutedFg, fontWeight: '500' },
  langTextActive: { color: COLORS.primary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  divider: { height: 0.5, backgroundColor: COLORS.muted, marginVertical: 12 },
  memTitle: { fontSize: 13, color: COLORS.mutedFg, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  memRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  memKey: { fontSize: 13, color: COLORS.secondaryFg, fontWeight: '600' },
  memValue: { fontSize: 13, color: COLORS.text, flex: 1 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 8 },
  dangerBtnText: { fontSize: 14, color: COLORS.danger, fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 14, height: 52, marginTop: 24, borderWidth: 0.5, borderColor: 'rgba(239, 68, 68, 0.2)' },
  logoutText: { fontSize: 16, fontWeight: '600', color: COLORS.danger },
  versionText: { fontSize: 12, color: COLORS.mutedFg, textAlign: 'center', marginTop: 24 },
});
