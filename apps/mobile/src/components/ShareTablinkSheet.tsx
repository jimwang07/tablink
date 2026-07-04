import { useState } from 'react';
import { Alert, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

import { colors } from '@/src/theme';
import { shareTablink } from '@/src/lib/shareTablink';

type ShareTablinkSheetProps = {
  visible: boolean;
  tablinkUrl: string | null;
  merchantName?: string | null;
  onClose: () => void;
  onShared?: () => void;
};

export function ShareTablinkSheet({
  visible,
  tablinkUrl,
  merchantName,
  onClose,
  onShared,
}: ShareTablinkSheetProps) {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleClose = () => {
    setShowQr(false);
    setCopied(false);
    onClose();
  };

  const handleSendLink = async () => {
    if (!tablinkUrl) return;

    try {
      const result = await shareTablink({ tablinkUrl, merchantName });
      if (result.action === Share.sharedAction) {
        onShared?.();
      }
    } catch (err) {
      console.error('[ShareTablinkSheet] Failed to share link:', err);
      Alert.alert('Share failed', 'Copy the link instead and send it manually.');
    }
  };

  const handleCopyLink = async () => {
    if (!tablinkUrl) return;

    await Clipboard.setStringAsync(tablinkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={handleClose}>
        <Pressable style={s.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.overline}>Share</Text>
              <Text style={s.title}>Share Tablink</Text>
              <Text style={s.subtitle}>
                {showQr ? 'Friends can scan this code to claim their items.' : 'Send the link, show a QR code, or copy it.'}
              </Text>
            </View>
            <Pressable style={({ pressed }) => [s.iconButton, pressed && s.pressed]} onPress={handleClose}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {showQr && tablinkUrl ? (
            <View style={s.qrPanel}>
              <View style={s.qrBox}>
                <QRCode value={tablinkUrl} size={212} backgroundColor="#FFFFFF" color="#05070A" />
              </View>
              <Text style={s.qrCaption} numberOfLines={1}>
                {tablinkUrl}
              </Text>
            </View>
          ) : null}

          <View style={s.actions}>
            <Pressable style={({ pressed }) => [s.primaryAction, pressed && s.primaryPressed]} onPress={handleSendLink}>
              <Ionicons name="send-outline" size={18} color="#04110D" />
              <Text style={s.primaryActionText}>Send link</Text>
              <Ionicons name="arrow-forward" size={16} color="#04110D" />
            </Pressable>

            <Pressable
              style={({ pressed }) => [s.optionAction, showQr && s.optionActionActive, pressed && s.optionPressed]}
              onPress={() => setShowQr((prev) => !prev)}
            >
              <Ionicons name="qr-code-outline" size={18} color={showQr ? colors.primary : colors.textSecondary} />
              <Text style={[s.optionActionText, showQr && s.optionActionTextActive]}>
                {showQr ? 'Hide QR code' : 'Show QR code'}
              </Text>
            </Pressable>

            <Pressable style={({ pressed }) => [s.optionAction, pressed && s.optionPressed]} onPress={handleCopyLink}>
              <Ionicons name={copied ? 'checkmark-circle' : 'copy-outline'} size={18} color={copied ? colors.primary : colors.textSecondary} />
              <Text style={[s.optionActionText, copied && s.optionActionTextActive]}>
                {copied ? 'Copied' : 'Copy link'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    padding: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  headerText: {
    flex: 1,
  },
  overline: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  qrPanel: {
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 4,
  },
  qrBox: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  qrCaption: {
    maxWidth: '100%',
    color: colors.muted,
    fontSize: 12,
    marginTop: 10,
  },
  actions: {
    gap: 10,
    marginTop: 22,
  },
  primaryAction: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  primaryActionText: {
    flex: 1,
    color: '#04110D',
    fontSize: 15,
    fontWeight: '800',
  },
  optionAction: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  optionActionActive: {
    borderColor: 'rgba(52, 211, 153, 0.34)',
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
  },
  optionActionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  optionActionTextActive: {
    color: colors.primary,
  },
  pressed: {
    opacity: 0.72,
  },
  primaryPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  optionPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
});
