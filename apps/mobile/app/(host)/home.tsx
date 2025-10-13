import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { colors } from '@/src/theme';

export default function HomeScreen() {
  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.header}>
        <Text style={styles.heading}>Welcome to Tablink</Text>
        <Text style={styles.subheading}>Scan receipts, share tablinks, and settle up fast.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>No receipts yet</Text>
        <Text style={styles.cardBody}>
          When you scan your first receipt, it will appear here with a live progress bar for your group.
        </Text>
        <Link href="/scan" style={styles.primaryLink}>
          Start a Scan
        </Link>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Tips</Text>
        <Text style={styles.tip}>• Use the floating button to scan or import a receipt photo.</Text>
        <Text style={styles.tip}>• Guests claim items via a web link—no app required.</Text>
        <Text style={styles.tip}>• Track red/yellow/green progress as friends settle.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 48,
    paddingBottom: 32,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subheading: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  cardBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 16,
  },
  primaryLink: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 16,
  },
  section: {
    marginBottom: 40,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  tip: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
});
