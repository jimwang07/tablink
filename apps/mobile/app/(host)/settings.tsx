import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
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
import { getSupabaseClient } from '@/src/lib/supabaseClient';

type PaymentHandles = {
  venmo_handle: string;
  cashapp_handle: string;
  paypal_handle: string;
};

const PAYMENT_FIELDS: {
  key: keyof PaymentHandles;
  label: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'venmo_handle', label: 'Venmo', placeholder: '@username', icon: 'logo-venmo' },
  { key: 'cashapp_handle', label: 'Cash App', placeholder: '$cashtag', icon: 'cash-outline' },
  { key: 'paypal_handle', label: 'PayPal', placeholder: 'PayPal.Me username', icon: 'logo-paypal' },
];

const TABLINK_BASE_URL = process.env.EXPO_PUBLIC_TABLINK_URL;

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

function SettingsSkeleton() {
  return (
    <SkeletonPulse>
      <View style={{ gap: 20, paddingTop: 12 }}>
        <SkeletonBar width="40%" height={16} />
        <SkeletonBar width="90%" height={12} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={s.skeletonRow}>
            <SkeletonBar width={60} />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <SkeletonBar width="60%" />
            </View>
          </View>
        ))}
      </View>
    </SkeletonPulse>
  );
}

/* ── Main screen ───────────────────────────────────────────── */

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut, isAuthenticating } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [handles, setHandles] = useState<PaymentHandles>({
    venmo_handle: '',
    cashapp_handle: '',
    paypal_handle: '',
  });

  const fallbackDisplayName = 'Host';
  const hasLoadedRef = useRef(false);

  // Load existing profile
  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) return;

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_profiles')
        .select('display_name, venmo_handle, cashapp_handle, paypal_handle')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setDisplayNameInput(data.display_name || fallbackDisplayName);
        setHandles({
          venmo_handle: data.venmo_handle || '',
          cashapp_handle: data.cashapp_handle || '',
          paypal_handle: data.paypal_handle || '',
        });
      }
      hasLoadedRef.current = true;
      setIsLoading(false);
    }

    loadProfile();
  }, [fallbackDisplayName, user?.id]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;

    setIsSaving(true);
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('user_profiles')
      .update({
        display_name: displayNameInput.trim() || fallbackDisplayName,
        venmo_handle: handles.venmo_handle.trim() || null,
        cashapp_handle: handles.cashapp_handle.trim() || null,
        paypal_handle: handles.paypal_handle.trim() || null,
      })
      .eq('user_id', user.id);

    setIsSaving(false);

    if (!error) {
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    }
  }, [displayNameInput, fallbackDisplayName, user?.id, handles]);

  const updateHandle = useCallback((field: keyof PaymentHandles, value: string) => {
    setHandles(prev => ({ ...prev, [field]: value }));
  }, []);

  const openGuestWebPage = useCallback(async (path: '/privacy' | '/support') => {
    if (!TABLINK_BASE_URL) {
      Alert.alert('Link unavailable', 'Missing Tablink URL configuration.');
      return;
    }

    try {
      await Linking.openURL(`${TABLINK_BASE_URL.replace(/\/$/, '')}${path}`);
    } catch {
      Alert.alert('Could not open link', 'Please try again.');
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!user?.id || isDeletingAccount) return;

    setIsDeletingAccount(true);
    const supabase = getSupabaseClient();

    try {
      const { data, error } = await supabase.functions.invoke<{ success: boolean; error?: string }>(
        'delete-account',
        { body: {} }
      );

      if (error || !data?.success) {
        throw new Error(error?.message ?? data?.error ?? 'Failed to delete account');
      }

      await supabase.auth.signOut({ scope: 'local' });
      Alert.alert('Account deleted', 'Your Tablink account has been permanently deleted.');
    } catch (error) {
      Alert.alert(
        'Could not delete account',
        error instanceof Error ? error.message : 'Please try again.'
      );
      setIsDeletingAccount(false);
    }
  }, [isDeletingAccount, user?.id]);

  const confirmDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, saved receipts, payment info, receipt photos, and shared links. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: deleteAccount,
        },
      ]
    );
  }, [deleteAccount]);

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top + 16 }]}>
          <View style={s.headerRow}>
            <Text style={s.heading}>Settings</Text>
            <View style={s.headerSpacer} />
          </View>
        </View>

        {isLoading ? (
          <View style={s.sectionPadding}>
            <SettingsSkeleton />
          </View>
        ) : (
          <>
            {/* Account section */}
            <Animated.View entering={FadeInDown.duration(400)} style={s.section}>
              <Text style={s.sectionLabel}>ACCOUNT</Text>
              <Text style={s.sectionDescription}>
                Choose the name guests see when they open your Tablink.
              </Text>
              <View style={s.inputGroup}>
                <View style={[s.inputRow, user?.email && s.inputRowBorder]}>
                  <Text style={s.inputLabel}>Name</Text>
                  <TextInput
                    style={s.input}
                    value={displayNameInput}
                    onChangeText={setDisplayNameInput}
                    placeholder="Host"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="done"
                  />
                </View>
                {user?.email ? (
                  <View style={[s.inputRow, s.readOnlyRow]}>
                    <Text style={[s.inputLabel, s.readOnlyLabel]}>Email</Text>
                    <Text style={s.readOnlyValue} numberOfLines={1}>
                      {user.email}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>

            {/* Payment methods section */}
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={s.section}>
              <Text style={s.sectionLabel}>PAYMENT INFO</Text>
              <Text style={s.sectionDescription}>
                Add your payment handles so guests can easily pay you after splitting a receipt.
              </Text>

              <View style={s.inputGroup}>
                {PAYMENT_FIELDS.map((field, index) => (
                  <View
                    key={field.key}
                    style={[
                      s.inputRow,
                      index < PAYMENT_FIELDS.length - 1 && s.inputRowBorder,
                    ]}
                  >
                    <Text style={s.inputLabel}>{field.label}</Text>
                    <TextInput
                      style={s.input}
                      value={handles[field.key]}
                      onChangeText={(v) => updateHandle(field.key, v)}
                      placeholder={field.placeholder}
                      placeholderTextColor={colors.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="default"
                    />
                  </View>
                ))}
              </View>

              <Pressable
                style={({ pressed }) => [
                  s.saveButton,
                  isSaving && s.buttonDisabled,
                  pressed && s.pressed,
                ]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {showSaved ? (
                  <View style={s.savedRow}>
                    <Ionicons name="checkmark" size={16} color="#000" />
                    <Text style={s.saveButtonText}>Saved</Text>
                  </View>
                ) : (
                  <Text style={s.saveButtonText}>
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Text>
                )}
              </Pressable>
            </Animated.View>

            {/* Legal and support */}
            <Animated.View entering={FadeInDown.delay(200).duration(400)} style={s.section}>
              <Text style={s.sectionLabel}>LEGAL & SUPPORT</Text>
              <View style={s.linkGroup}>
                <Pressable
                  style={({ pressed }) => [s.linkRow, s.inputRowBorder, pressed && s.pressed]}
                  onPress={() => openGuestWebPage('/privacy')}
                >
                  <View style={s.linkLabelRow}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={colors.textSecondary} />
                    <Text style={s.linkLabel}>Privacy Policy</Text>
                  </View>
                  <Ionicons name="open-outline" size={18} color={colors.muted} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.linkRow, pressed && s.pressed]}
                  onPress={() => openGuestWebPage('/support')}
                >
                  <View style={s.linkLabelRow}>
                    <Ionicons name="help-circle-outline" size={18} color={colors.textSecondary} />
                    <Text style={s.linkLabel}>Support</Text>
                  </View>
                  <Ionicons name="open-outline" size={18} color={colors.muted} />
                </Pressable>
              </View>
            </Animated.View>

            {/* Sign out */}
            <Animated.View entering={FadeInDown.delay(300).duration(400)} style={s.section}>
              <Pressable
                style={({ pressed }) => [s.signOutButton, pressed && s.pressed]}
                onPress={signOut}
                disabled={isAuthenticating || isDeletingAccount}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                <Text style={s.signOutText}>
                  {isAuthenticating ? 'Signing out...' : 'Sign Out'}
                </Text>
              </Pressable>
            </Animated.View>

            {/* Delete account */}
            <Animated.View entering={FadeInDown.delay(350).duration(400)} style={s.section}>
              <Text style={s.sectionLabel}>DELETE ACCOUNT</Text>
              <Text style={s.sectionDescription}>
                Permanently delete your account, saved receipts, payment info, and shared links.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  s.deleteButton,
                  isDeletingAccount && s.buttonDisabled,
                  pressed && s.pressed,
                ]}
                onPress={confirmDeleteAccount}
                disabled={isDeletingAccount}
              >
                {isDeletingAccount ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                )}
                <Text style={s.deleteText}>
                  {isDeletingAccount ? 'Deleting account...' : 'Delete Account'}
                </Text>
              </Pressable>
            </Animated.View>
          </>
        )}
      </ScrollView>

    </KeyboardAvoidingView>
  );
}

/* ── Styles ────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },

  /* Header */
  header: {
    paddingTop: 60,
    paddingBottom: 4,
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

  sectionPadding: {
    paddingTop: 8,
  },

  /* Sections */
  section: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },

  /* Input group */
  inputGroup: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  inputRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
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
  readOnlyRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.018)',
  },
  readOnlyLabel: {
    color: colors.muted,
  },
  readOnlyValue: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
  },
  linkGroup: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  linkRow: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  linkLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  linkLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },

  /* Save button */
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },

  /* Sign out */
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  signOutText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 69, 58, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.24)',
  },
  deleteText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },

  /* Skeleton */
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
});
