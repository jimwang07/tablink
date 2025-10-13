import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/src/theme';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Account & Preferences</Text>
      <Text style={styles.body}>
        Once authentication is wired, you’ll manage your profile, payment handles, and notification options here.
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
