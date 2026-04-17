import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Platform,
  KeyboardAvoidingView, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  bg: '#0A0908', card: '#141311', primary: '#FFC107', primaryDark: '#422006',
  muted: '#27272A', mutedFg: '#A1A1AA', white: '#FFFFFF', text: '#E4E4E7',
  secondaryFg: '#FDE68A', danger: '#EF4444',
};

type AuthScreenProps = {
  onAuthSuccess: (user: any, token: string) => void;
};

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body = isLogin ? { email, password } : { email, password, name: name || email.split('@')[0] };

      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Authentication failed');
        return;
      }

      onAuthSuccess(data, data.token);
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
      const redirectUrl = `${window.location.origin}/api/auth/google-callback`;
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      await WebBrowser.openBrowserAsync(authUrl);
    } catch (err) {
      setError('Google login failed. Please try email login.');
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Logo */}
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>L</Text>
          </View>
          <Text style={styles.title}>LAILA AI</Text>
          <Text style={styles.subtitle}>Africa Smart Assistant</Text>

          {/* Tab Toggle */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              testID="login-tab"
              style={[styles.tab, isLogin && styles.tabActive]}
              onPress={() => { setIsLogin(true); setError(''); }}
            >
              <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="register-tab"
              style={[styles.tab, !isLogin && styles.tabActive]}
              onPress={() => { setIsLogin(false); setError(''); }}
            >
              <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Register</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={20} color={COLORS.mutedFg} style={styles.inputIcon} />
                <TextInput
                  testID="name-input"
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={COLORS.mutedFg}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={COLORS.mutedFg} style={styles.inputIcon} />
              <TextInput
                testID="email-input"
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={COLORS.mutedFg}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.mutedFg} style={styles.inputIcon} />
              <TextInput
                testID="password-input"
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={COLORS.mutedFg}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={COLORS.mutedFg} />
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              testID="auth-submit-btn"
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={COLORS.primaryDark} />
              ) : (
                <Text style={styles.submitText}>{isLogin ? 'Login' : 'Create Account'}</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Login */}
            <TouchableOpacity testID="google-login-btn" style={styles.googleBtn} onPress={handleGoogleLogin}>
              <Ionicons name="logo-google" size={20} color={COLORS.white} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>
            By continuing, you agree to use LAILA AI responsibly.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  flex1: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 40 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoText: { fontSize: 32, fontWeight: '800', color: COLORS.primaryDark },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.white, marginBottom: 2 },
  subtitle: { fontSize: 13, color: COLORS.secondaryFg, letterSpacing: 1, marginBottom: 32 },
  tabRow: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12, padding: 4, marginBottom: 24, width: '100%' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 15, fontWeight: '600', color: COLORS.mutedFg },
  tabTextActive: { color: COLORS.primaryDark },
  form: { width: '100%', gap: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 0.5, borderColor: COLORS.muted, paddingHorizontal: 14 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 16 : 12, fontSize: 15, color: COLORS.white },
  eyeBtn: { padding: 8 },
  errorText: { color: COLORS.danger, fontSize: 13, textAlign: 'center' },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { fontSize: 16, fontWeight: '700', color: COLORS.primaryDark },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: COLORS.muted },
  dividerText: { fontSize: 13, color: COLORS.mutedFg },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#333', borderRadius: 14, height: 52, borderWidth: 0.5, borderColor: COLORS.muted },
  googleText: { fontSize: 15, fontWeight: '600', color: COLORS.white },
  footerText: { fontSize: 12, color: COLORS.mutedFg, textAlign: 'center', marginTop: 24, lineHeight: 18 },
});
