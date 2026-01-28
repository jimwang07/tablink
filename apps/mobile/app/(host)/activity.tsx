import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/src/theme';
import { useAuth } from '@/src/hooks/useAuth';
import {
  ActivityItem,
  fetchRecentActivity,
  subscribeToActivity,
} from '@/src/services/activityService';

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

function ActivityItemRow({
  item,
  onPress,
}: {
  item: ActivityItem;
  onPress: () => void;
}) {
  const emoji = item.participantEmoji || '👤';
  const description =
    item.type === 'claim'
      ? `claimed "${item.itemName}"`
      : item.type === 'payment'
      ? `paid ${item.amountCents ? formatCents(item.amountCents) : ''}${item.paymentMethod ? ` via ${item.paymentMethod}` : ''}`
      : `joined the receipt`;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.activityItem,
        pressed && styles.activityItemPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.avatarContainer}>
        <Text style={styles.avatar}>{emoji}</Text>
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityText}>
          <Text style={styles.participantName}>{item.participantName}</Text>
          {' '}
          {description}
        </Text>
        <View style={styles.activityMeta}>
          <Text style={styles.receiptName}>{item.receiptName}</Text>
          <Text style={styles.separator}>•</Text>
          <Text style={styles.timestamp}>{formatRelativeTime(item.timestamp)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>📋</Text>
      <Text style={styles.emptyTitle}>No activity yet</Text>
      <Text style={styles.emptySubtitle}>
        When friends join and claim items on your receipts, you'll see it here in real-time.
      </Text>
    </View>
  );
}

export default function ActivityScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadActivity = useCallback(async () => {
    if (!user?.id) return;

    try {
      const data = await fetchRecentActivity(user.id);
      setActivities(data);
    } catch (error) {
      console.error('[ActivityScreen] Failed to load activity:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  // Initial load
  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = subscribeToActivity(user.id, {
      onClaim: (activity) => {
        setActivities((prev) => {
          // Avoid duplicates
          if (prev.some((a) => a.id === activity.id)) return prev;
          return [activity, ...prev].slice(0, 50);
        });
      },
      onJoin: (activity) => {
        setActivities((prev) => {
          // Avoid duplicates
          if (prev.some((a) => a.id === activity.id)) return prev;
          return [activity, ...prev].slice(0, 50);
        });
      },
      onPayment: (activity) => {
        setActivities((prev) => {
          // Avoid duplicates
          if (prev.some((a) => a.id === activity.id)) return prev;
          return [activity, ...prev].slice(0, 50);
        });
      },
    });

    return unsubscribe;
  }, [user?.id]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadActivity();
  }, [loadActivity]);

  const handleActivityPress = useCallback(
    (item: ActivityItem) => {
      router.push(`/receipt/${item.receiptId}`);
    },
    [router]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Activity</Text>
      <FlatList
        data={activities}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ActivityItemRow
            item={item}
            onPress={() => handleActivityPress(item)}
          />
        )}
        contentContainerStyle={activities.length === 0 ? styles.emptyList : undefined}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 100,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  activityItemPressed: {
    backgroundColor: colors.surface,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatar: {
    fontSize: 20,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  participantName: {
    color: colors.text,
    fontWeight: '600',
  },
  activityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  receiptName: {
    color: colors.muted,
    fontSize: 13,
  },
  separator: {
    color: colors.muted,
    fontSize: 13,
    marginHorizontal: 6,
  },
  timestamp: {
    color: colors.muted,
    fontSize: 13,
  },
});
