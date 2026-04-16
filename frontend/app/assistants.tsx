import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
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
  muted: '#27272A',
  mutedFg: '#A1A1AA',
  white: '#FFFFFF',
  text: '#E4E4E7',
};

type AssistantType = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
  type: string;
  placeholder: string;
};

const ASSISTANTS: AssistantType[] = [
  {
    id: 'cv',
    title: 'CV Builder',
    desc: 'Create a professional CV',
    icon: 'document-text',
    color: '#F59E0B',
    type: 'cv',
    placeholder: 'Enter your name, skills, experience, and education...',
  },
  {
    id: 'job',
    title: 'Job Finder',
    desc: 'Find job opportunities',
    icon: 'briefcase',
    color: '#3B82F6',
    type: 'job_ideas',
    placeholder: 'Describe your skills, location, and job preferences...',
  },
  {
    id: 'business',
    title: 'Business Ideas',
    desc: 'Start earning money',
    icon: 'trending-up',
    color: '#10B981',
    type: 'business_ideas',
    placeholder: 'What resources do you have? (phone, small capital, skills...)',
  },
  {
    id: 'homework',
    title: 'Homework Help',
    desc: 'Step-by-step explanations',
    icon: 'school',
    color: '#8B5CF6',
    type: 'homework',
    placeholder: 'Paste your homework question or describe the problem...',
  },
  {
    id: 'social',
    title: 'Social Media',
    desc: 'Create engaging content',
    icon: 'share-social',
    color: '#EC4899',
    type: 'social_media',
    placeholder: 'What type of content? (Instagram post, tweet, video idea...)',
  },
  {
    id: 'message',
    title: 'Pro Messages',
    desc: 'Write professional messages',
    icon: 'mail',
    color: '#06B6D4',
    type: 'professional_message',
    placeholder: 'Describe the context (job application, client message, email...)',
  },
];

export default function AssistantsScreen() {
  const [selected, setSelected] = useState<AssistantType | null>(null);
  const [details, setDetails] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!selected || !details.trim() || loading) return;
    setLoading(true);
    setResult('');
    Keyboard.dismiss();

    try {
      const res = await fetch(`${BACKEND_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selected.type,
          details: details.trim(),
          device_id: DEVICE_ID,
        }),
      });

      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      setResult(data.message.content);
    } catch (err) {
      setResult('Sorry, something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setSelected(null);
    setDetails('');
    setResult('');
  };

  if (selected) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity testID="back-btn" onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{selected.title}</Text>
            <Text style={styles.headerSub}>{selected.desc}</Text>
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
            <View style={styles.inputCard}>
              <View style={[styles.iconCircle, { backgroundColor: selected.color + '20' }]}>
                <Ionicons name={selected.icon as any} size={28} color={selected.color} />
              </View>
              <Text style={styles.inputLabel}>Describe what you need:</Text>
              <TextInput
                testID="assistant-input"
                style={styles.textArea}
                placeholder={selected.placeholder}
                placeholderTextColor={COLORS.mutedFg}
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={3000}
              />
            </View>

            <TouchableOpacity
              testID="generate-btn"
              style={[styles.generateBtn, (!details.trim() || loading) && styles.btnDisabled]}
              onPress={generate}
              disabled={!details.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={COLORS.primaryDark} />
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color={COLORS.primaryDark} />
                  <Text style={styles.generateBtnText}>Generate with AI</Text>
                </>
              )}
            </TouchableOpacity>

            {result ? (
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>Result</Text>
                <Text style={styles.resultText}>{result}</Text>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>AI Assistants</Text>
          <Text style={styles.headerSub}>Tools to help you succeed</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.gridContent} showsVerticalScrollIndicator={false}>
        {ASSISTANTS.map((assistant) => (
          <TouchableOpacity
            key={assistant.id}
            testID={`assistant-card-${assistant.id}`}
            style={styles.card}
            onPress={() => setSelected(assistant)}
            activeOpacity={0.7}
          >
            <View style={[styles.cardIcon, { backgroundColor: assistant.color + '20' }]}>
              <Ionicons name={assistant.icon as any} size={28} color={assistant.color} />
            </View>
            <Text style={styles.cardTitle}>{assistant.title}</Text>
            <Text style={styles.cardDesc}>{assistant.desc}</Text>
            <View style={styles.cardArrow}>
              <Ionicons name="arrow-forward" size={16} color={COLORS.mutedFg} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 44 : 12,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.muted,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  headerInfo: {
    flex: 1,
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
  gridContent: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 40,
  },
  card: {
    width: '47%',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: COLORS.muted,
    minHeight: 140,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: COLORS.mutedFg,
    lineHeight: 16,
  },
  cardArrow: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  detailContent: {
    padding: 20,
    paddingBottom: 40,
  },
  inputCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 0.5,
    borderColor: COLORS.muted,
    marginBottom: 16,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 12,
  },
  textArea: {
    fontSize: 15,
    color: COLORS.white,
    minHeight: 120,
    textAlignVertical: 'top',
    lineHeight: 22,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 0.5,
    borderColor: COLORS.muted,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    marginBottom: 20,
  },
  generateBtnText: {
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
    padding: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 193, 7, 0.15)',
  },
  resultLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  resultText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 24,
  },
});
