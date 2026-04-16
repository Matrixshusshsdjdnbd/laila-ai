import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  SafeAreaView, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
};

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'wo', name: 'Wolof', flag: '🇸🇳' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
];

export default function TranslateScreen() {
  const [sourceText, setSourceText] = useState('');
  const [result, setResult] = useState('');
  const [sourceLang, setSourceLang] = useState('fr');
  const [targetLang, setTargetLang] = useState('en');
  const [loading, setLoading] = useState(false);

  const translate = async () => {
    if (!sourceText.trim() || loading) return;
    setLoading(true);
    setResult('');
    Keyboard.dismiss();

    try {
      const res = await fetch(`${BACKEND_URL}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText.trim(),
          source_lang: sourceLang,
          target_lang: targetLang,
          device_id: 'device-translate',
        }),
      });

      if (!res.ok) throw new Error('Translation failed');
      const data = await res.json();
      setResult(data.translation);
    } catch (err) {
      setResult('Translation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(result);
    setResult('');
  };

  const getLangInfo = (code: string) => LANGUAGES.find(l => l.code === code) || LANGUAGES[0];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Translation</Text>
        <Text style={styles.headerSub}>Wolof · French · English · Italian</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Language Selector */}
          <View style={styles.langRow}>
            <View style={styles.langSelector}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {LANGUAGES.map(lang => (
                  <TouchableOpacity
                    key={`src-${lang.code}`}
                    testID={`source-lang-${lang.code}`}
                    style={[styles.langChip, sourceLang === lang.code && styles.langChipActive]}
                    onPress={() => setSourceLang(lang.code)}
                  >
                    <Text style={styles.langFlag}>{lang.flag}</Text>
                    <Text style={[styles.langName, sourceLang === lang.code && styles.langNameActive]}>
                      {lang.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Source Input */}
          <View style={styles.inputCard}>
            <Text style={styles.cardLabel}>
              {getLangInfo(sourceLang).flag} {getLangInfo(sourceLang).name}
            </Text>
            <TextInput
              testID="translate-input"
              style={styles.textArea}
              placeholder="Enter text to translate..."
              placeholderTextColor={COLORS.mutedFg}
              value={sourceText}
              onChangeText={setSourceText}
              multiline
              maxLength={2000}
            />
            {sourceText.length > 0 && (
              <Text style={styles.charCount}>{sourceText.length}/2000</Text>
            )}
          </View>

          {/* Swap & Translate */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              testID="swap-languages-btn"
              style={styles.swapBtn}
              onPress={swapLanguages}
            >
              <Ionicons name="swap-vertical" size={24} color={COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="translate-btn"
              style={[styles.translateBtn, (!sourceText.trim() || loading) && styles.btnDisabled]}
              onPress={translate}
              disabled={!sourceText.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={COLORS.primaryDark} />
              ) : (
                <Text style={styles.translateBtnText}>Translate</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Target Language */}
          <View style={styles.langSelector}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {LANGUAGES.map(lang => (
                <TouchableOpacity
                  key={`tgt-${lang.code}`}
                  testID={`target-lang-${lang.code}`}
                  style={[styles.langChip, targetLang === lang.code && styles.langChipActive]}
                  onPress={() => setTargetLang(lang.code)}
                >
                  <Text style={styles.langFlag}>{lang.flag}</Text>
                  <Text style={[styles.langName, targetLang === lang.code && styles.langNameActive]}>
                    {lang.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Result */}
          <View style={styles.resultCard}>
            <Text style={styles.cardLabel}>
              {getLangInfo(targetLang).flag} {getLangInfo(targetLang).name}
            </Text>
            {result ? (
              <Text style={styles.resultText}>{result}</Text>
            ) : (
              <Text style={styles.placeholderText}>Translation will appear here...</Text>
            )}
          </View>
        </ScrollView>
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
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  langRow: {
    marginBottom: 16,
  },
  langSelector: {
    marginBottom: 12,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.muted,
  },
  langChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.secondary,
  },
  langFlag: {
    fontSize: 16,
    marginRight: 6,
  },
  langName: {
    fontSize: 13,
    color: COLORS.mutedFg,
    fontWeight: '500',
  },
  langNameActive: {
    color: COLORS.primary,
  },
  inputCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: COLORS.muted,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 13,
    color: COLORS.mutedFg,
    marginBottom: 8,
    fontWeight: '600',
  },
  textArea: {
    fontSize: 16,
    color: COLORS.white,
    minHeight: 100,
    textAlignVertical: 'top',
    lineHeight: 24,
  },
  charCount: {
    fontSize: 11,
    color: COLORS.mutedFg,
    textAlign: 'right',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  swapBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.muted,
  },
  translateBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translateBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  resultCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 193, 7, 0.15)',
    minHeight: 120,
  },
  resultText: {
    fontSize: 16,
    color: COLORS.white,
    lineHeight: 24,
  },
  placeholderText: {
    fontSize: 15,
    color: COLORS.mutedFg,
    fontStyle: 'italic',
  },
});
