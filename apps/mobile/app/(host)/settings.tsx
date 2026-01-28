import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';

import { colors } from '@/src/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { getSupabaseClient } from '@/src/lib/supabaseClient';

type PaymentHandles = {
  venmo_handle: string;
  cashapp_handle: string;
  paypal_handle: string;
  zelle_identifier: string;
};

export default function SettingsScreen() {
  const { user, signOut, isAuthenticating } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [handles, setHandles] = useState<PaymentHandles>({
    venmo_handle: '',
    cashapp_handle: '',
    paypal_handle: '',
    zelle_identifier: '',
  });

  const displayName = user?.user_metadata?.full_name || user?.email || 'You';

  // Load existing profile
  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) return;

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_profiles')
        .select('venmo_handle, cashapp_handle, paypal_handle, zelle_identifier')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setHandles({
          venmo_handle: data.venmo_handle || '',
          cashapp_handle: data.cashapp_handle || '',
          paypal_handle: data.paypal_handle || '',
          zelle_identifier: data.zelle_identifier || '',
        });
      }
      setIsLoading(false);
    }

    loadProfile();
  }, [user?.id]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;

    setIsSaving(true);
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('user_profiles')
      .update({
        venmo_handle: handles.venmo_handle.trim() || null,
        cashapp_handle: handles.cashapp_handle.trim() || null,
        paypal_handle: handles.paypal_handle.trim() || null,
        zelle_identifier: handles.zelle_identifier.trim() || null,
      })
      .eq('user_id', user.id);

    setIsSaving(false);

    if (!error) {
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    }
  }, [user?.id, handles]);

  const updateHandle = useCallback((field: keyof PaymentHandles, value: string) => {
    setHandles(prev => ({ ...prev, [field]: value }));
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Settings</Text>
        <Text style={styles.subheading}>Signed in as {displayName}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Methods</Text>
          <Text style={styles.sectionDescription}>
            Add your payment handles so guests can easily pay you after splitting a receipt.
          </Text>

          <View style={styles.inputGroup}>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Venmo</Text>
              <TextInput
                style={styles.input}
                value={handles.venmo_handle}
                onChangeText={(v) => updateHandle('venmo_handle', v)}
                placeholder="@username"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Cash App</Text>
              <TextInput
                style={styles.input}
                value={handles.cashapp_handle}
                onChangeText={(v) => updateHandle('cashapp_handle', v)}
                placeholder="$cashtag"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>PayPal</Text>
              <TextInput
                style={styles.input}
                value={handles.paypal_handle}
                onChangeText={(v) => updateHandle('paypal_handle', v)}
                placeholder="username or email"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Zelle</Text>
              <TextInput
                style={styles.input}
                value={handles.zelle_identifier}
                onChangeText={(v) => updateHandle('zelle_identifier', v)}
                placeholder="email or phone"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : showSaved ? (
              <Text style={styles.saveButtonText}>Saved!</Text>
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={signOut}
          disabled={isAuthenticating}
        >
          <Text style={styles.signOutText}>
            {isAuthenticating ? 'Signing out...' : 'Sign Out'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subheading: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  inputGroup: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  inputLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
    width: 80,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
    textAlign: 'right',
  },
  saveButton: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceBorder,
    marginVertical: 24,
  },
  signOutButton: {
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
