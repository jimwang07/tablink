import { useEffect } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { usePendingReceipt } from '@/src/hooks/usePendingReceipt';
import { colors } from '@/src/theme';

function formatCurrency(amount: number, currencyCode: string) {
  if (Number.isNaN(amount)) {
    return '—';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode || 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode || 'USD'} ${amount.toFixed(2)}`;
  }
}

export default function ReceiptReviewScreen() {
  const router = useRouter();
  const { pendingReceipt, setPendingReceipt } = usePendingReceipt();

  useEffect(() => {
    if (!pendingReceipt) {
      router.replace('/(host)/home');
    }
  }, [pendingReceipt, router]);

  if (!pendingReceipt) {
    return null;
  }

  // pull everything we care about
  const { parsed, publicUrl, localUri } = pendingReceipt;

  // 👇 pick something actually renderable for <Image />
  // priority:
  //   1. localUri (always works right after capture/import)
  //   2. publicUrl (may be null now if bucket is private)
  //   3. '' fallback so RN Image doesn't explode on undefined
  const previewImageUri = localUri || publicUrl || '';

  const currencyCode = parsed.currency || 'USD';

  const handleRetake = () => {
    setPendingReceipt(null);
    router.replace('/scan');
  };

  const handleContinue = () => {
    // TODO: save receipt to DB etc.
    setPendingReceipt(null);
    router.replace('/(host)/home');
  };

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.header}>
        <Text style={styles.title}>Receipt ready to review</Text>
        <Text style={styles.subtitle}>
          Double-check the line items below. You can retake the photo if something looks off.
        </Text>
      </View>

      <View style={styles.previewCard}>
        <Image
          source={{ uri: previewImageUri }}
          resizeMode="cover"
          style={styles.previewImage}
        />
        <View style={styles.previewMeta}>
          <Text style={styles.metaLabel}>Merchant</Text>
          <Text style={styles.metaValue}>{parsed.merchantName ?? 'Unknown merchant'}</Text>

          <Text style={[styles.metaLabel, styles.metaSpacing]}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(parsed.totals.total, currencyCode)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Items</Text>
        {parsed.items.length === 0 ? (
          <Text style={styles.emptyItemsText}>
            No line items detected. Retake the photo if this looks wrong.
          </Text>
        ) : (
          parsed.items.map((item, index) => (
            <View key={`${item.name}-${index}`} style={styles.itemRow}>
              <View style={styles.itemText}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemQuantity}>× {item.quantity}</Text>
              </View>
              <Text style={styles.itemPrice}>
                {formatCurrency(item.price * item.quantity, currencyCode)}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>
            {formatCurrency(parsed.totals.subtotal, currencyCode)}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tax</Text>
          <Text style={styles.totalValue}>
            {formatCurrency(parsed.totals.tax, currencyCode)}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tip</Text>
          <Text style={styles.totalValue}>
            {formatCurrency(parsed.totals.tip, currencyCode)}
          </Text>
        </View>
        <View style={[styles.totalRow, styles.totalRowStrong]}>
          <Text style={styles.totalLabelStrong}>Total</Text>
          <Text style={styles.totalValueStrong}>
            {formatCurrency(parsed.totals.total, currencyCode)}
          </Text>
        </View>
      </View>

      {parsed.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notesText}>{parsed.notes}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleRetake}>
          <Text style={styles.secondaryButtonText}>Retake Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
          <Text style={styles.primaryButtonText}>Looks Good</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
  },
  emptyItemsText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
  },
  header: {
    gap: 12,
    marginBottom: 20,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 24,
  },
  previewImage: {
    width: '100%',
    height: 200,
    backgroundColor: colors.surfaceBorder,
  },
  previewMeta: {
    padding: 16,
    gap: 4,
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaSpacing: {
    marginTop: 12,
  },
  metaValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceBorder,
  },
  itemText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  itemQuantity: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  itemPrice: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  totalRowStrong: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceBorder,
  },
  totalLabel: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  totalValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  totalLabelStrong: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  totalValueStrong: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  notesText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
