import { Tabs } from 'expo-router';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/src/theme/colors';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

/* ── Tab definitions ───────────────────────────────────────── */

type TabDef = {
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
  label: string;
};

const TABS: Record<string, TabDef> = {
  home:     { outline: 'home-outline',     filled: 'home',     label: 'Home' },
  activity: { outline: 'pulse-outline',    filled: 'pulse',    label: 'Activity' },
  settings: { outline: 'settings-outline', filled: 'settings', label: 'Settings' },
};

/* ── Custom tab bar ────────────────────────────────────────── */

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const tab = TABS[route.name];
        if (!tab) return null;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={tab.label}
            style={s.tabItem}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          >
            {focused && <View style={s.activeIndicator} />}
            <Ionicons
              name={focused ? tab.filled : tab.outline}
              size={22}
              color={focused ? colors.primary : colors.muted}
            />
            <Text style={[s.tabLabel, focused && s.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Layout ────────────────────────────────────────────────── */

export default function HostTabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, lazy: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

/* ── Styles ────────────────────────────────────────────────── */

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  activeIndicator: {
    position: 'absolute',
    top: -12,
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: colors.primary,
  },
});
