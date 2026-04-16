import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  bg: '#0A0908',
  primary: '#FFC107',
  muted: '#27272A',
  mutedFg: '#A1A1AA',
};

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

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.mutedFg,
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
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

const styles = StyleSheet.create({
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
