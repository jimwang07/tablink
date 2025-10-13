import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/src/theme';

export default function ActivityScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Live Activity</Text>
      <Text style={styles.body}>
        We’ll surface claim events, payment confirmations, and reminders here. For now, this is a placeholder
        while we wire the realtime feed.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    gap: 12,
    justifyContent: 'center',
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  body: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
});
