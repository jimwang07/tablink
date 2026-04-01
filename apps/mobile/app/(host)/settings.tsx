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
  zelle_identifier: string;
};

const PAYMENT_FIELDS: {
  key: keyof PaymentHandles;
  label: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'venmo_handle', label: 'Venmo', placeholder: '@username', icon: 'logo-venmo' },
  { key: 'cashapp_handle', label: 'Cash App', placeholder: '$cashtag', icon: 'cash-outline' },
  { key: 'paypal_handle', label: 'PayPal', placeholder: 'username or email', icon: 'logo-paypal' },
  { key: 'zelle_identifier', label: 'Zelle', placeholder: 'email or phone', icon: 'send-outline' },
];

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
        {[0, 1, 2, 3].map((i) => (
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
  const [showSaved, setShowSaved] = useState(false);
  const [handles, setHandles] = useState<PaymentHandles>({
    venmo_handle: '',
    cashapp_handle: '',
    paypal_handle: '',
    zelle_identifier: '',
  });

  const displayName = user?.user_metadata?.full_name || user?.email || 'You';
  const hasLoadedRef = useRef(false);

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
      hasLoadedRef.current = true;
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
              <View style={s.accountRow}>
                <View style={s.avatarCircle}>
                  <Text style={s.avatarText}>
                    {displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={s.accountInfo}>
                  <Text style={s.accountName}>{displayName}</Text>
                  {user?.email && displayName !== user.email && (
                    <Text style={s.accountEmail}>{user.email}</Text>
                  )}
                </View>
              </View>
            </Animated.View>

            {/* Payment methods section */}
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={s.section}>
              <Text style={s.sectionLabel}>PAYMENT METHODS</Text>
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
                      keyboardType={
                        field.key === 'paypal_handle' || field.key === 'zelle_identifier'
                          ? 'email-address'
                          : 'default'
                      }
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

            {/* Sign out */}
            <Animated.View entering={FadeInDown.delay(200).duration(400)} style={s.section}>
              <Pressable
                style={({ pressed }) => [s.signOutButton, pressed && s.pressed]}
                onPress={signOut}
                disabled={isAuthenticating}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                <Text style={s.signOutText}>
                  {isAuthenticating ? 'Signing out...' : 'Sign Out'}
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

  /* Account */
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  accountEmail: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
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
