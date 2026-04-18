import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  SafeAreaView, Switch, Alert, ActivityIndicator, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  bg: '#0A0908', card: '#141311', primary: '#FFC107', primaryDark: '#422006',
  muted: '#27272A', mutedFg: '#A1A1AA', white: '#FFFFFF', text: '#E4E4E7',
  secondaryFg: '#FDE68A', danger: '#EF4444', success: '#22C55E',
  wave: '#1DC3DC', orange: '#FF6600', vip: '#A855F7',
};

const LANGUAGES = [
  { code: 'auto', name: 'Auto' }, { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' }, { code: 'it', name: 'Italiano' }, { code: 'wo', name: 'Wolof' },
];

type Voice = { id: string; name: string; desc: string; gender: string };

export default function SettingsScreen() {
  const [settings, setSettings] = useState({ preferred_language: 'auto', voice_enabled: true, tts_enabled: true, tts_voice: 'nova', memory_enabled: true, theme: 'dark' });
  const [memories, setMemories] = useState<Record<string, string>>({});
  const [user, setUser] = useState<any>(null);
  const [referral, setReferral] = useState<any>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
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
      const [sR, mR, uR, rR, vR] = await Promise.all([
        fetch(`${BACKEND_URL}/api/settings`, { headers: h }),
        fetch(`${BACKEND_URL}/api/memory`, { headers: h }),
        fetch(`${BACKEND_URL}/api/auth/me`, { headers: h }),
        fetch(`${BACKEND_URL}/api/referral`, { headers: h }),
        fetch(`${BACKEND_URL}/api/voices`),
      ]);
      if (sR.ok) {
        const s = await sR.json();
        setSettings(s);
        // Mirror voice pref to AsyncStorage for index.tsx/call.tsx to read
        if (s.tts_voice) await AsyncStorage.setItem('laila_tts_voice', s.tts_voice);
      }
      if (mR.ok) { const d = await mR.json(); setMemories(d.memories || {}); }
      if (uR.ok) setUser(await uR.json());
      if (rR.ok) setReferral(await rR.json());
      if (vR.ok) { const d = await vR.json(); setVoices(d.voices || []); }
    } catch {} finally { setLoading(false); }
  };

  const updateSetting = async (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    const h = await getHeaders();
    await fetch(`${BACKEND_URL}/api/settings`, { method: 'PUT', headers: h, body: JSON.stringify({ [key]: value }) }).catch(() => {});
    // Mirror key prefs locally for fast access elsewhere in the app
    if (key === 'tts_voice') await AsyncStorage.setItem('laila_tts_voice', String(value));
  };

  const clearMemory = () => Alert.alert('Clear Memory', 'LAILA will forget everything about you.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: async () => { const h = await getHeaders(); await fetch(`${BACKEND_URL}/api/memory`, { method: 'DELETE', headers: h }); setMemories({}); }},
  ]);

  const clearHistory = () => Alert.alert('Clear All Chats', 'All conversations will be permanently deleted.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete All', style: 'destructive', onPress: async () => { const h = await getHeaders(); await fetch(`${BACKEND_URL}/api/settings/history`, { method: 'DELETE', headers: h }); Alert.alert('Done', 'All conversations deleted.'); }},
  ]);

  const handleLogout = () => Alert.alert('Logout', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Logout', style: 'destructive', onPress: async () => { const h = await getHeaders(); await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', headers: h }); await AsyncStorage.multiRemove(['laila_auth_token', 'laila_auth_user']); Alert.alert('Logged Out', 'Please restart the app.'); }},
  ]);

  const shareReferral = async () => {
    if (!referral) return;
    try {
      await Share.share({ message: `Join LAILA AI - Africa's Smart Assistant! Use my code: ${referral.referral_code}\n\nDownload: ${referral.share_link}` });
    } catch {}
  };

  const copyCode = async () => {
    if (!referral?.referral_code) return;
    await Clipboard.setStringAsync(referral.referral_code);
    Alert.alert('Copied!', 'Referral code copied to clipboard');
  };

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} /></SafeAreaView>;

  const tierColor = user?.tier === 'premium' ? COLORS.primary : user?.tier_label === 'VIP' ? COLORS.vip : COLORS.mutedFg;
  const memKeys = Object.keys(memories);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}><Text style={s.headerTitle}>Settings</Text></View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Account Card ── */}
        <View style={s.accountCard}>
          <View style={[s.avatarLg, { borderColor: tierColor }]}>
            <Text style={s.avatarLetter}>{(user?.name || 'U')[0].toUpperCase()}</Text>
          </View>
          <Text style={s.accountName}>{user?.name || 'User'}</Text>
          <Text style={s.accountEmail}>{user?.email || ''}</Text>
          <View style={[s.tierBadge, { backgroundColor: tierColor + '20', borderColor: tierColor + '40' }]}>
            <Ionicons name={user?.tier === 'premium' ? 'star' : 'person'} size={14} color={tierColor} />
            <Text style={[s.tierText, { color: tierColor }]}>{user?.tier_label || 'FREE'}</Text>
          </View>
          {user?.tier === 'free' && (
            <>
              <Text style={s.usageBar}>{user?.daily_messages || 0}/{user?.daily_limit || 20} messages today</Text>
              <TouchableOpacity testID="upgrade-premium-btn" style={s.upgradeBtn} onPress={() => router.push('/premium')}>
                <Ionicons name="star" size={16} color={COLORS.primaryDark} />
                <Text style={s.upgradeBtnText}>Upgrade to Premium</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Referral ── */}
        <Text style={s.section}>Invite Friends</Text>
        <View style={s.card}>
          <Text style={s.refTitle}>Share LAILA AI & earn Premium</Text>
          <View style={s.refCodeRow}>
            <Text style={s.refCode}>{referral?.referral_code || '...'}</Text>
            <TouchableOpacity testID="copy-code-btn" onPress={copyCode} style={s.copyBtn}>
              <Ionicons name="copy" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          <View style={s.refStats}>
            <View style={s.refStat}><Text style={s.refStatNum}>{referral?.referral_count || 0}</Text><Text style={s.refStatLabel}>Friends</Text></View>
            <View style={s.refStat}><Text style={s.refStatNum}>{referral?.bonus_days_earned || 0}</Text><Text style={s.refStatLabel}>Bonus days</Text></View>
          </View>
          <TouchableOpacity testID="share-referral-btn" style={s.shareBtn} onPress={shareReferral}>
            <Ionicons name="share-social" size={18} color={COLORS.primaryDark} />
            <Text style={s.shareBtnText}>Share on WhatsApp</Text>
          </TouchableOpacity>
          {referral?.rewards?.map((r: any, i: number) => (
            <View key={i} style={s.rewardRow}>
              <Text style={s.rewardFriends}>{r.friends} friend{r.friends > 1 ? 's' : ''}</Text>
              <Text style={s.rewardText}>{r.reward}</Text>
            </View>
          ))}
        </View>

        {/* ── Language ── */}
        <Text style={s.section}>Language</Text>
        <View style={s.card}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {LANGUAGES.map(l => (
              <TouchableOpacity key={l.code} testID={`lang-${l.code}`}
                style={[s.langChip, settings.preferred_language === l.code && s.langChipActive]}
                onPress={() => updateSetting('preferred_language', l.code)}>
                <Text style={[s.langText, settings.preferred_language === l.code && s.langActive]}>{l.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Voice ── */}
        <Text style={s.section}>Voice</Text>
        <View style={s.card}>
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}><Text style={s.label}>Voice Input</Text><Text style={s.desc}>Speak instead of typing</Text></View>
            <Switch testID="toggle-voice" value={settings.voice_enabled} onValueChange={v => updateSetting('voice_enabled', v)} trackColor={{ false: COLORS.muted, true: COLORS.primary + '60' }} thumbColor={settings.voice_enabled ? COLORS.primary : COLORS.mutedFg} />
          </View>
          <View style={s.div} />
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}><Text style={s.label}>Text-to-Speech</Text><Text style={s.desc}>Listen to responses</Text></View>
            <Switch testID="toggle-tts" value={settings.tts_enabled} onValueChange={v => updateSetting('tts_enabled', v)} trackColor={{ false: COLORS.muted, true: COLORS.primary + '60' }} thumbColor={settings.tts_enabled ? COLORS.primary : COLORS.mutedFg} />
          </View>
          {settings.tts_enabled && voices.length > 0 && (
            <>
              <View style={s.div} />
              <Text style={s.voiceTitle}>Voice Style</Text>
              {voices.map(v => (
                <TouchableOpacity key={v.id} testID={`voice-${v.id}`}
                  style={[s.voiceCard, settings.tts_voice === v.id && s.voiceCardActive]}
                  onPress={() => updateSetting('tts_voice', v.id)}>
                  <Ionicons name={v.gender === 'female' ? 'woman' : v.gender === 'male' ? 'man' : 'body'} size={18} color={settings.tts_voice === v.id ? COLORS.primary : COLORS.mutedFg} />
                  <View style={{ flex: 1 }}><Text style={[s.voiceName, settings.tts_voice === v.id && { color: COLORS.primary }]}>{v.name}</Text><Text style={s.voiceDesc}>{v.desc}</Text></View>
                  <View style={[s.radio, settings.tts_voice === v.id && s.radioActive]}>{settings.tts_voice === v.id && <View style={s.radioDot} />}</View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>

        {/* ── Memory ── */}
        <Text style={s.section}>Memory</Text>
        <View style={s.card}>
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}><Text style={s.label}>Smart Memory</Text><Text style={s.desc}>LAILA remembers preferences</Text></View>
            <Switch testID="toggle-memory" value={settings.memory_enabled} onValueChange={v => updateSetting('memory_enabled', v)} trackColor={{ false: COLORS.muted, true: COLORS.primary + '60' }} thumbColor={settings.memory_enabled ? COLORS.primary : COLORS.mutedFg} />
          </View>
          {memKeys.length > 0 && (
            <>
              <View style={s.div} />
              <Text style={s.memTitle}>What LAILA knows:</Text>
              {memKeys.map(k => (
                <View key={k} style={s.memRow}>
                  <Ionicons name="bookmark" size={14} color={COLORS.primary} />
                  <Text style={s.memKey}>{k}:</Text>
                  <Text style={s.memVal}>{memories[k]}</Text>
                </View>
              ))}
            </>
          )}
          <TouchableOpacity testID="clear-memory-btn" style={s.dangerRow} onPress={clearMemory}>
            <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
            <Text style={s.dangerText}>Clear All Memory</Text>
          </TouchableOpacity>
        </View>

        {/* ── Data ── */}
        <Text style={s.section}>Data</Text>
        <View style={s.card}>
          <TouchableOpacity testID="clear-history-btn" style={s.dangerRow} onPress={clearHistory}>
            <Ionicons name="chatbubbles-outline" size={16} color={COLORS.danger} />
            <Text style={s.dangerText}>Delete All Conversations</Text>
          </TouchableOpacity>
        </View>

        {/* ── Logout ── */}
        <TouchableOpacity testID="logout-btn" style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={s.version}>LAILA AI v3.0 · Created by Bathie Sarr</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 44 : 12, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.muted },
  headerTitle: { fontSize: 24, fontWeight: '700', color: COLORS.white },
  content: { padding: 16, paddingBottom: 40 },
  section: { fontSize: 12, fontWeight: '700', color: COLORS.mutedFg, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: COLORS.muted },
  // Account
  accountCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.muted },
  avatarLg: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 12 },
  avatarLetter: { fontSize: 26, fontWeight: '800', color: COLORS.primaryDark },
  accountName: { fontSize: 20, fontWeight: '700', color: COLORS.white },
  accountEmail: { fontSize: 13, color: COLORS.mutedFg, marginTop: 2 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginTop: 10, borderWidth: 1 },
  tierText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  usageBar: { fontSize: 12, color: COLORS.mutedFg, marginTop: 10 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, marginTop: 12 },
  upgradeBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.primaryDark },
  // Referral
  refTitle: { fontSize: 15, fontWeight: '600', color: COLORS.white, marginBottom: 10 },
  refCodeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: COLORS.primary + '30' },
  refCode: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.primary, letterSpacing: 1 },
  copyBtn: { padding: 4 },
  refStats: { flexDirection: 'row', gap: 24, marginTop: 12, marginBottom: 12 },
  refStat: { alignItems: 'center' },
  refStatNum: { fontSize: 22, fontWeight: '800', color: COLORS.white },
  refStatLabel: { fontSize: 11, color: COLORS.mutedFg },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, height: 44 },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.primaryDark },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, marginTop: 2 },
  rewardFriends: { fontSize: 13, color: COLORS.mutedFg },
  rewardText: { fontSize: 13, color: COLORS.secondaryFg, fontWeight: '500' },
  // Language
  langChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.bg, marginRight: 8, borderWidth: 1, borderColor: COLORS.muted },
  langChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  langText: { fontSize: 13, color: COLORS.mutedFg, fontWeight: '500' },
  langActive: { color: COLORS.primary },
  // Toggles
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  label: { fontSize: 15, fontWeight: '600', color: COLORS.white },
  desc: { fontSize: 12, color: COLORS.mutedFg, marginTop: 2 },
  div: { height: 0.5, backgroundColor: COLORS.muted, marginVertical: 12 },
  // Voice
  voiceTitle: { fontSize: 13, fontWeight: '600', color: COLORS.mutedFg, marginBottom: 8 },
  voiceCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4 },
  voiceCardActive: { backgroundColor: COLORS.primary + '10' },
  voiceName: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  voiceDesc: { fontSize: 11, color: COLORS.mutedFg },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.muted, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: COLORS.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  // Memory
  memTitle: { fontSize: 13, color: COLORS.mutedFg, fontWeight: '600', marginBottom: 6 },
  memRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  memKey: { fontSize: 13, color: COLORS.secondaryFg, fontWeight: '600' },
  memVal: { fontSize: 13, color: COLORS.text, flex: 1 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 6 },
  dangerText: { fontSize: 14, color: COLORS.danger, fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 14, height: 52, marginTop: 24, borderWidth: 0.5, borderColor: 'rgba(239,68,68,0.2)' },
  logoutText: { fontSize: 16, fontWeight: '600', color: COLORS.danger },
  version: { fontSize: 12, color: COLORS.mutedFg, textAlign: 'center', marginTop: 24 },
});
