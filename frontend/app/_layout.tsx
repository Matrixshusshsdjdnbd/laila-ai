import React, { useState, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthScreen from '../components/AuthScreen';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  bg: '#0A0908', card: '#141311', primary: '#FFC107', primaryDark: '#422006',
  muted: '#27272A', mutedFg: '#A1A1AA', white: '#FFFFFF',
};

const ONBOARDING_KEY = 'laila_onboarding_done';
const AUTH_TOKEN_KEY = 'laila_auth_token';
const AUTH_USER_KEY = 'laila_auth_user';

function ChatIcon({ color }: { color: string }) { return <Ionicons name="chatbubble-ellipses" size={24} color={color} />; }
function TranslateIcon({ color }: { color: string }) { return <Ionicons name="language" size={24} color={color} />; }
function AssistantsIcon({ color }: { color: string }) { return <Ionicons name="grid" size={24} color={color} />; }
function PremiumIcon({ color }: { color: string }) { return <Ionicons name="star" size={24} color={color} />; }
function HistoryIcon({ color }: { color: string }) { return <Ionicons name="time" size={24} color={color} />; }

// Simple onboarding slides
const SLIDES = [
  { icon: 'sparkles', title: 'Welcome to LAILA AI', sub: 'Africa Smart Assistant', desc: 'Your personal AI assistant for daily life in Africa.', color: COLORS.primary },
  { icon: 'language', title: 'Speak Your Language', sub: 'Wolof · French · English · Italian', desc: 'Write in any language and LAILA responds naturally.', color: '#3B82F6' },
  { icon: 'briefcase', title: 'Work & Business', sub: 'CV · Jobs · Business Ideas', desc: 'Find work, create CVs, and grow your career.', color: '#10B981' },
  { icon: 'camera', title: 'Image Analysis', sub: 'Photos · Documents · Translation', desc: 'Send photos and get instant AI analysis.', color: '#A855F7' },
];

import { TouchableOpacity, ScrollView, Dimensions } from 'react-native';
const { width: SW } = Dimensions.get('window');

function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [slide, setSlide] = useState(0);
  const s = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;
  return (
    <View style={onStyles.c}>
      <StatusBar style="light" />
      {!isLast && <TouchableOpacity testID="onboarding-skip-btn" style={onStyles.skip} onPress={onComplete}><Text style={onStyles.skipT}>Skip</Text></TouchableOpacity>}
      <View style={onStyles.cnt}>
        <View style={[onStyles.ic, { backgroundColor: s.color + '20' }]}><Ionicons name={s.icon as any} size={48} color={s.color} /></View>
        <Text style={onStyles.t}>{s.title}</Text>
        <Text style={[onStyles.st, { color: s.color }]}>{s.sub}</Text>
        <Text style={onStyles.d}>{s.desc}</Text>
        <View style={onStyles.dots}>{SLIDES.map((_, i) => <View key={i} style={[onStyles.dot, i === slide ? [onStyles.dotA, { backgroundColor: s.color }] : {}]} />)}</View>
      </View>
      <TouchableOpacity testID="onboarding-next-btn" style={[onStyles.btn, { backgroundColor: s.color }]} onPress={() => isLast ? onComplete() : setSlide(slide + 1)}>
        <Text style={onStyles.btnT}>{isLast ? 'Get Started' : 'Continue'}</Text>
        <Ionicons name={isLast ? 'rocket' : 'arrow-forward'} size={20} color={isLast ? COLORS.primaryDark : '#FFF'} />
      </TouchableOpacity>
    </View>
  );
}

const onStyles = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'space-between', paddingTop: Platform.OS === 'android' ? 50 : 60, paddingBottom: Platform.OS === 'android' ? 32 : 48, paddingHorizontal: 24 },
  skip: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  skipT: { fontSize: 15, color: COLORS.mutedFg },
  cnt: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  ic: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  t: { fontSize: 28, fontWeight: '800', color: COLORS.white, textAlign: 'center', marginBottom: 6 },
  st: { fontSize: 15, fontWeight: '600', textAlign: 'center', marginBottom: 16, letterSpacing: 0.5 },
  d: { fontSize: 16, color: COLORS.mutedFg, textAlign: 'center', lineHeight: 24, maxWidth: 300 },
  dots: { flexDirection: 'row', gap: 8, marginTop: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.muted },
  dotA: { width: 24, borderRadius: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56, borderRadius: 28 },
  btnT: { fontSize: 17, fontWeight: '700', color: COLORS.primaryDark },
});

export default function RootLayout() {
  const [stage, setStage] = useState<'loading' | 'onboarding' | 'auth' | 'app'>('loading');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const onboardingDone = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (onboardingDone !== 'true') { setStage('onboarding'); return; }
      const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      const userStr = await AsyncStorage.getItem(AUTH_USER_KEY);
      if (token && userStr) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const userData = await res.json();
            setUser(userData);
            setAuthToken(token);
            setStage('app');
            return;
          }
        } catch {}
      }
      setStage('auth');
    } catch { setStage('auth'); }
  };

  const completeOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
    setStage('auth');
  };

  const handleAuth = async (userData: any, token: string) => {
    setUser(userData);
    setAuthToken(token);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token).catch(() => {});
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData)).catch(() => {});
    setStage('app');
  };

  if (stage === 'loading') return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />;
  if (stage === 'onboarding') return <OnboardingScreen onComplete={completeOnboarding} />;
  if (stage === 'auth') return <AuthScreen onAuthSuccess={handleAuth} />;

  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: tabStyles.tabBar,
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.mutedFg,
          tabBarLabelStyle: tabStyles.tabLabel,
          tabBarItemStyle: tabStyles.tabItem,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Chat', tabBarIcon: ChatIcon, tabBarTestID: 'bottom-nav-chat' }} />
        <Tabs.Screen name="translate" options={{ title: 'Translate', tabBarIcon: TranslateIcon, tabBarTestID: 'bottom-nav-translate' }} />
        <Tabs.Screen name="assistants" options={{ title: 'Assistants', tabBarIcon: AssistantsIcon, tabBarTestID: 'bottom-nav-assistants' }} />
        <Tabs.Screen name="premium" options={{ title: 'Premium', tabBarIcon: PremiumIcon, tabBarTestID: 'bottom-nav-premium' }} />
        <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: HistoryIcon, tabBarTestID: 'bottom-nav-history' }} />
      </Tabs>
    </>
  );
}

const tabStyles = StyleSheet.create({
  tabBar: { backgroundColor: 'rgba(10, 9, 8, 0.95)', borderTopColor: '#27272A', borderTopWidth: 0.5, height: Platform.OS === 'ios' ? 88 : 64, paddingBottom: Platform.OS === 'ios' ? 28 : 8, paddingTop: 8, elevation: 0 },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  tabItem: { paddingVertical: 4 },
});
