import { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs } from 'expo-router';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/src/theme/colors';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAuth } from '@/src/hooks/useAuth';
import {
  hasUnreadActivity,
  markActivitySeen,
  subscribeToActivity,
} from '@/src/services/activityService';

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

function TabBar({
  state,
  navigation,
  showActivityDot,
  onActivityPress,
}: BottomTabBarProps & {
  showActivityDot: boolean;
  onActivityPress: () => void;
}) {
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
              if (route.name === 'activity') {
                onActivityPress();
              }
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          >
            {focused && <View style={s.activeIndicator} />}
            <View style={s.iconWrap}>
              <Ionicons
                name={focused ? tab.filled : tab.outline}
                size={22}
                color={focused ? colors.primary : colors.muted}
              />
              {route.name === 'activity' && showActivityDot && !focused ? (
                <View style={s.activityDot} />
              ) : null}
            </View>
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
  const { user } = useAuth();
  const [showActivityDot, setShowActivityDot] = useState(false);
  const activityFocusedRef = useRef(false);

  const refreshUnreadActivity = useCallback(async () => {
    if (!user?.id) {
      setShowActivityDot(false);
      return;
    }

    setShowActivityDot(await hasUnreadActivity(user.id));
  }, [user?.id]);

  const markSeen = useCallback(() => {
    if (!user?.id) return;
    setShowActivityDot(false);
    void markActivitySeen(user.id);
  }, [user?.id]);

  useEffect(() => {
    void refreshUnreadActivity();
  }, [refreshUnreadActivity]);

  useEffect(() => {
    if (!user?.id) return;

    const markUnread = () => {
      if (activityFocusedRef.current) {
        markSeen();
        return;
      }

      setShowActivityDot(true);
    };
    const unsubscribe = subscribeToActivity(user.id, {
      onClaim: markUnread,
      onJoin: markUnread,
      onPayment: markUnread,
      onSettled: markUnread,
    });

    return unsubscribe;
  }, [markSeen, user?.id]);

  return (
    <Tabs
      tabBar={(props) => (
        <TabBar
          {...props}
          showActivityDot={showActivityDot && props.state.routes[props.state.index]?.name !== 'activity'}
          onActivityPress={markSeen}
        />
      )}
      screenOptions={{ headerShown: false, lazy: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen
        name="activity"
        listeners={{
          focus: () => {
            activityFocusedRef.current = true;
            markSeen();
          },
          blur: () => {
            activityFocusedRef.current = false;
          },
        }}
      />
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
  iconWrap: {
    position: 'relative',
  },
  activityDot: {
    position: 'absolute',
    top: -2,
    right: -5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.background,
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
