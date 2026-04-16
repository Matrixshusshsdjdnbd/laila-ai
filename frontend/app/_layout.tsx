import React, { useState, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
};

const ONBOARDING_KEY = 'laila_onboarding_done';

function ChatIcon({ color }: { color: string }) {
  return <Ionicons name="chatbubble-ellipses" size={24} color={color} />;
}

function TranslateIcon({ color }: { color: string }) {
  return <Ionicons name="language" size={24} color={color} />;
}

function AssistantsIcon({ color }: { color: string }) {
  return <Ionicons name="grid" size={24} color={color} />;
}

function HistoryIcon({ color }: { color: string }) {
  return <Ionicons name="time" size={24} color={color} />;
}

const ONBOARDING_SLIDES = [
  {
    icon: 'sparkles',
    title: 'Welcome to LAILA AI',
    subtitle: 'Africa Smart Assistant',
    desc: 'Your personal AI assistant designed for daily life in Africa. Simple, fast, and powerful.',
    color: COLORS.primary,
  },
  {
    icon: 'language',
    title: 'Speak Your Language',
    subtitle: 'Wolof · French · English · Italian',
    desc: 'Write in any language and LAILA responds in the same language. Natural and accurate.',
    color: '#3B82F6',
  },
  {
    icon: 'briefcase',
    title: 'Work & Business',
    subtitle: 'CV · Jobs · Business Ideas',
    desc: 'Find work, create CVs, get business ideas, and grow your career with AI-powered advice.',
    color: '#10B981',
  },
  {
    icon: 'school',
    title: 'Study & Learn',
    subtitle: 'Homework · Tutoring · Skills',
    desc: 'Step-by-step explanations for any subject. Like having a patient teacher in your pocket.',
    color: '#A855F7',
  },
];

function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    if (currentSlide < ONBOARDING_SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const slide = ONBOARDING_SLIDES[currentSlide];
  const isLast = currentSlide === ONBOARDING_SLIDES.length - 1;

  return (
    <View style={onStyles.container}>
      <StatusBar style="light" backgroundColor={COLORS.bg} />

      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity
          testID="onboarding-skip-btn"
          style={onStyles.skipBtn}
          onPress={onComplete}
        >
          <Text style={onStyles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      <View style={onStyles.content}>
        {/* Icon */}
        <View style={[onStyles.iconCircle, { backgroundColor: slide.color + '20' }]}>
          <Ionicons name={slide.icon as any} size={48} color={slide.color} />
        </View>

        {/* Text */}
        <Text style={onStyles.title}>{slide.title}</Text>
        <Text style={[onStyles.subtitle, { color: slide.color }]}>{slide.subtitle}</Text>
        <Text style={onStyles.desc}>{slide.desc}</Text>

        {/* Dots */}
        <View style={onStyles.dots}>
          {ONBOARDING_SLIDES.map((_, idx) => (
            <View
              key={idx}
              style={[
                onStyles.dot,
                idx === currentSlide ? [onStyles.dotActive, { backgroundColor: slide.color }] : {},
              ]}
            />
          ))}
        </View>
      </View>

      {/* Button */}
      <TouchableOpacity
        testID="onboarding-next-btn"
        style={[onStyles.nextBtn, { backgroundColor: slide.color }]}
        onPress={nextSlide}
        activeOpacity={0.8}
      >
        <Text style={onStyles.nextBtnText}>
          {isLast ? 'Start Using LAILA AI' : 'Continue'}
        </Text>
        <Ionicons
          name={isLast ? 'rocket' : 'arrow-forward'}
          size={20}
          color={isLast ? COLORS.primaryDark : '#FFFFFF'}
        />
      </TouchableOpacity>
    </View>
  );
}

const onStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 50 : 60,
    paddingBottom: Platform.OS === 'android' ? 32 : 48,
    paddingHorizontal: 24,
  },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 15,
    color: COLORS.mutedFg,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  desc: {
    fontSize: 16,
    color: COLORS.mutedFg,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.muted,
  },
  dotActive: {
    width: 24,
    borderRadius: 4,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: 28,
  },
  nextBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
});

export default function RootLayout() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      const done = await AsyncStorage.getItem(ONBOARDING_KEY);
      setShowOnboarding(done !== 'true');
    } catch {
      setShowOnboarding(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {
      // continue anyway
    }
    setShowOnboarding(false);
  };

  if (showOnboarding === null) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />;
  }

  if (showOnboarding) {
    return <OnboardingScreen onComplete={completeOnboarding} />;
  }

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
        <Tabs.Screen
          name="index"
          options={{
            title: 'Chat',
            tabBarIcon: ChatIcon,
            tabBarTestID: 'bottom-nav-chat',
          }}
        />
        <Tabs.Screen
          name="translate"
          options={{
            title: 'Translate',
            tabBarIcon: TranslateIcon,
            tabBarTestID: 'bottom-nav-translate',
          }}
        />
        <Tabs.Screen
          name="assistants"
          options={{
            title: 'Assistants',
            tabBarIcon: AssistantsIcon,
            tabBarTestID: 'bottom-nav-assistants',
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: HistoryIcon,
            tabBarTestID: 'bottom-nav-history',
          }}
        />
      </Tabs>
    </>
  );
}

const tabStyles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(10, 9, 8, 0.95)',
    borderTopColor: '#27272A',
    borderTopWidth: 0.5,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    paddingTop: 8,
    elevation: 0,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tabItem: {
    paddingVertical: 4,
  },
});
