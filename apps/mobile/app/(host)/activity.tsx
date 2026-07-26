import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/src/theme';
import { useAuth } from '@/src/hooks/useAuth';
import {
  ActivityItem,
  fetchRecentActivity,
  markActivitySeen,
  subscribeToActivity,
} from '@/src/services/activityService';

/* ── Type colors (matches home status system) ──────────────── */

const TYPE_COLOR: Record<string, string> = {
  claim: '#FBBF24',
  payment: '#34D399',
  join: '#60A5FA',
  settled: '#34D399',
};

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  claim: 'pricetag',
  payment: 'checkmark-circle',
  join: 'person-add',
};

/* ── Helpers ───────────────────────────────────────────────── */

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/* ── Skeleton ──────────────────────────────────────────────── */

function SkeletonPulse({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 900 }),
      -1,
      true
    );
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function SkeletonBar({ width, height = 14 }: { width: number | `${number}%`; height?: number }) {
  return (
    <View style={{ width, height, borderRadius: 6, backgroundColor: 'rgba(255, 255, 255, 0.06)' }} />
  );
}

function ActivitySkeleton() {
  return (
    <SkeletonPulse>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={s.skeletonRow}>
          <SkeletonBar width={36} height={36} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonBar width="80%" />
            <SkeletonBar width="50%" height={12} />
          </View>
        </View>
      ))}
    </SkeletonPulse>
  );
}

/* ── Components ────────────────────────────────────────────── */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ActivityItemRow({
  item,
  index,
  onPress,
}: {
  item: ActivityItem;
  index: number;
  onPress: () => void;
}) {
  const accent = TYPE_COLOR[item.type] || colors.muted;
  const icon = TYPE_ICON[item.type] || 'ellipse';

  const description =
    item.type === 'claim'
      ? `claimed "${item.itemName}"`
      : item.type === 'payment'
      ? `paid ${item.amountCents ? formatCents(item.amountCents) : ''}${item.paymentMethod ? ` via ${item.paymentMethod}` : ''}`
      : item.type === 'settled'
      ? 'is fully settled!'
      : `joined the receipt`;

  return (
    <AnimatedPressable
      entering={FadeInDown.delay(index * 50).duration(400).springify()}
      style={({ pressed }) => [s.activityRow, pressed && s.pressed]}
      onPress={onPress}
    >
      <View style={s.activityMain}>
        <View style={[s.iconContainer, { backgroundColor: `${accent}10` }]}>
          {item.type === 'settled' ? (
            <Text style={s.activityEmoji}>🎉</Text>
          ) : (
            <Ionicons name={icon} size={16} color={accent} />
          )}
        </View>
        <View style={s.activityContent}>
          <Text style={s.activityText}>
            <Text style={s.participantName}>{item.participantName}</Text>
            {' '}{description}
          </Text>
          <View style={s.activityMeta}>
            <Text style={s.receiptName} numberOfLines={1}>{item.receiptName}</Text>
            <Text style={s.dot}>·</Text>
            <Text style={s.timestamp}>{formatRelativeTime(item.timestamp)}</Text>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function EmptyState() {
  return (
    <Animated.View entering={FadeInDown.duration(500)} style={s.emptyState}>
      <View style={s.emptyIcon}>
        <Ionicons name="pulse-outline" size={24} color={colors.muted} />
      </View>
      <Text style={s.emptyTitle}>No activity yet</Text>
      <Text style={s.emptyDescription}>
        When friends join and claim items on your receipts, updates appear here in real time.
      </Text>
    </Animated.View>
  );
}

/* ── Main screen ───────────────────────────────────────────── */

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);

  const loadActivity = useCallback(async () => {
    if (!user?.id) return;

    const isInitialLoad = !hasLoadedRef.current;
    if (isInitialLoad) {
      setIsLoading(true);
    }

    try {
      const data = await fetchRecentActivity(user.id);
      setActivities(data);
      hasLoadedRef.current = true;
    } catch (error) {
      console.error('[ActivityScreen] Failed to load activity:', error);
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
      }
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadActivity();

      if (!user?.id) return;
      void markActivitySeen(user.id);

      const addActivity = (activity: ActivityItem) => {
        setActivities((prev) => {
          if (prev.some((a) => a.id === activity.id)) return prev;
          return [activity, ...prev].slice(0, 50);
        });
      };

      const unsubscribe = subscribeToActivity(user.id, {
        onClaim: addActivity,
        onJoin: addActivity,
        onPayment: addActivity,
        onSettled: addActivity,
      });

      return unsubscribe;
    }, [loadActivity, user?.id])
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadActivity();
    setIsRefreshing(false);
  }, [loadActivity]);

  const handleActivityPress = useCallback(
    (item: ActivityItem) => {
      router.push({
        pathname: '/receipt/[id]',
        params: { id: item.receiptId },
      });
    },
    [router]
  );

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <Text style={s.heading}>Activity</Text>
          <View style={s.headerSpacer} />
        </View>
      </View>

      {isLoading ? (
        <View style={s.skeletonContainer}>
          <ActivitySkeleton />
        </View>
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <ActivityItemRow
              item={item}
              index={index}
              onPress={() => handleActivityPress(item)}
            />
          )}
          contentContainerStyle={activities.length === 0 ? s.emptyList : s.listContent}
          ListEmptyComponent={EmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 14,
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 40,
  },
  heading: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  headerSpacer: {
    width: 76,
    flexShrink: 0,
  },

  /* List */
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 120,
    gap: 12,
  },
  emptyList: {
    flex: 1,
  },

  /* Activity row */
  activityRow: {
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  activityMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginRight: 18,
  },
  activityEmoji: {
    fontSize: 16,
    lineHeight: 18,
  },
  activityContent: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  activityText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
    flexShrink: 1,
  },
  participantName: {
    color: colors.text,
    fontWeight: '600',
  },
  activityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  receiptName: {
    color: colors.muted,
    fontSize: 13,
    flexShrink: 1,
  },
  dot: {
    color: colors.muted,
    fontSize: 13,
  },
  timestamp: {
    color: colors.muted,
    fontSize: 13,
  },

  /* Empty state (matches home) */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 48,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyDescription: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },

  /* Skeleton */
  skeletonContainer: {
    paddingHorizontal: 24,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
});
