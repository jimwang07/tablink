import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import { colors } from '@/src/theme';
import { useAuth } from '@/src/hooks/useAuth';

export default function SettingsScreen() {
  const { user, signOut, isAuthenticating } = useAuth();

  const displayName = user?.user_metadata?.full_name || user?.email || 'You';

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Account & Preferences</Text>
      <Text style={styles.body}>
        Signed in as {displayName}. Soon you’ll configure default payment handles, notifications, and saved groups
        here.
      </Text>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={signOut}
        disabled={isAuthenticating}
      >
        <Text style={styles.signOutText}>{isAuthenticating ? 'Signing out...' : 'Sign out'}</Text>
      </TouchableOpacity>
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
  signOutButton: {
    marginTop: 24,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  signOutText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
