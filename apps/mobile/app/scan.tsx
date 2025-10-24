import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions, type PhotoFile } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/src/theme';
import { uploadReceiptImage } from '@/src/lib/imageUpload';
import { useAuth } from '@/src/hooks/useAuth';
import { usePendingReceipt } from '@/src/hooks/usePendingReceipt';
import { invokeParseReceipt } from '@/src/lib/api/parseReceipt';

const FOOTER_OVERLAY_SPACE = 220;

type ScanState = 'idle' | 'preview' | 'uploading' | 'processing' | 'error';

export default function ScanReceiptScreen() {
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = ImagePicker.useMediaLibraryPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastPhoto, setLastPhoto] = useState<PhotoFile | null>(null);
  const [importPreview, setImportPreview] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(FOOTER_OVERLAY_SPACE);
  const [flowState, setFlowState] = useState<ScanState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { session } = useAuth();
  const { setPendingReceipt } = usePendingReceipt();

  const hasCameraPermission = useMemo(() => cameraPermission?.granted === true, [cameraPermission]);
  const hasPreview = Boolean(lastPhoto || importPreview);
  const isPreviewActive = flowState === 'preview' && hasPreview;

  const requestPermissions = useCallback(async () => {
    const { status } = await requestCameraPermission();
    if (status !== 'granted') {
      Alert.alert(
        'Camera access needed',
        'We use your camera to scan receipts. Enable access in Settings to continue.'
      );
    }
  }, [requestCameraPermission]);

  const handleImport = useCallback(async () => {
    const ensurePermission = async () => {
      if (!mediaPermission || mediaPermission.status !== 'granted') {
        const { status } = await requestMediaPermission();
        return status === 'granted';
      }
      return true;
    };

    const permitted = await ensurePermission();
    if (!permitted) {
      Alert.alert(
        'Photo library access needed',
        'Grant access to your photo library to import an existing receipt image.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsMultipleSelection: false,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      setImportPreview(asset.uri);
      setLastPhoto(null);
      Alert.alert('Receipt imported', 'The image has been selected. Parsing will happen in the next step.');
    }
  }, [mediaPermission, requestMediaPermission]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) {
      return;
    }

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: Platform.OS === 'android',
      });
      setLastPhoto(photo);
      setImportPreview(null);
      Alert.alert('Receipt captured', 'We will parse the image right after you confirm details.');
      setFlowState('preview');
    } catch (error) {
      console.warn('Failed to capture photo', error);
      Alert.alert('Capture failed', 'We could not capture the photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const beginUploadAndParse = useCallback(
    async (localUri: string, userId: string) => {
      try {
        setFlowState('uploading');
        setErrorMessage(null);

        const uploadResult = await uploadReceiptImage(localUri, userId);

        setFlowState('processing');
        const parsed = await invokeParseReceipt(uploadResult.publicUrl, userId);

        setPendingReceipt({
          localUri,
          storagePath: uploadResult.storagePath,
          publicUrl: uploadResult.publicUrl,
          parsed,
        });

        // TODO: navigate to draft editor route once implemented
      } catch (error) {
        console.error('Scan flow error:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to process receipt');
        setFlowState('error');
      }
    },
    [setPendingReceipt]
  );

  const handleFooterLayout = useCallback(
    ({ nativeEvent }: { nativeEvent: { layout: { height: number } } }) => {
      const nextHeight = nativeEvent.layout.height;
      if (nextHeight > 0 && Math.abs(nextHeight - footerHeight) > 2) {
        setFooterHeight(nextHeight);
      }
    },
    [footerHeight]
  );

  if (cameraPermission?.granted === false) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera permission required</Text>
        <Text style={styles.permissionBody}>
          Tablink uses your camera to scan receipts quickly. Please enable camera access in your device settings.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermissions}>
          <Text style={styles.primaryButtonText}>Request permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.cameraContainer}>
        {!hasCameraPermission ? (
          <View style={styles.permissionLoader}>
            <ActivityIndicator size="large" color={colors.primary} />
            <TouchableOpacity style={styles.permissionLink} onPress={requestPermissions}>
              <Text style={styles.permissionLinkText}>Tap to enable camera access</Text>
            </TouchableOpacity>
          </View>
        ) : isPreviewActive ? (
          <View style={styles.cameraPlaceholder} />
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            isActive={isFocused && flowState === 'idle'}
            enableHighQualityPhotos
          />
        )}

        {hasCameraPermission && flowState === 'idle' && (
          <View pointerEvents="none" style={[styles.overlayContainer, { paddingBottom: footerHeight }]}>
            <View style={styles.overlayTopMask} />
            <View style={styles.overlayCenterWrapper}>
              <View style={styles.overlayCenter}>
               <View style={styles.cornerTopLeft} />
               <View style={styles.cornerTopRight} />
               <View style={styles.cornerBottomLeft} />
               <View style={styles.cornerBottomRight} />
             </View>
           </View>
            <View style={[styles.overlayBottomMask, { height: footerHeight }]} />
         </View>
       )}
      </View>

      <SafeAreaView
        style={[styles.footer, isPreviewActive ? styles.footerConfirmation : styles.footerActions]}
        onLayout={handleFooterLayout}
      >
        {isPreviewActive ? (
          <View style={styles.confirmationContainer}>
            <Text style={styles.previewLabel}>Latest capture</Text>
            <Image source={{ uri: lastPhoto?.uri ?? importPreview ?? '' }} style={styles.previewImage} />
            <Text style={styles.previewHint}>
              Looks good? We’ll parse the receipt on the next screen when you continue.
            </Text>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={() => {
                setLastPhoto(null);
                setImportPreview(null);
                setFlowState('idle');
              }}
            >
              <Ionicons name="refresh" size={18} color={colors.text} />
              <Text style={styles.retakeButtonText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => {
                if (!session?.user?.id) {
                  Alert.alert('Sign in required', 'You must be signed in to process receipts.');
                  return;
                }

                const sourceUri = lastPhoto?.uri ?? importPreview;
                if (!sourceUri) {
                  Alert.alert('No image', 'Please capture or import a receipt first.');
                  return;
                }

                beginUploadAndParse(sourceUri, session.user.id);
              }}
            >
              <Text style={styles.continueButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        ) : flowState === 'uploading' ? (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusText}>Uploading receipt…</Text>
          </View>
        ) : flowState === 'processing' ? (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusText}>Parsing receipt…</Text>
          </View>
        ) : flowState === 'error' && errorMessage ? (
          <View style={styles.statusContainer}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setErrorMessage(null);
                setFlowState('idle');
              }}
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.footerButtons}>
            <TouchableOpacity
              style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
              onPress={handleCapture}
              disabled={isCapturing || !hasCameraPermission}
            >
              {isCapturing ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Ionicons name="camera" size={28} color={colors.background} />
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.importButton} onPress={handleImport}>
              <Ionicons name="images-outline" size={22} color={colors.text} />
              <Text style={styles.importButtonText}>Import photo</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: colors.background,
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  permissionLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 16,
  },
  permissionLink: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  permissionLinkText: {
    color: colors.text,
    fontSize: 14,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  overlayTopMask: {
    flexGrow: 1.2,
    backgroundColor: 'rgba(8,10,12,0.55)',
  },
  overlayCenterWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  overlayCenter: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 3 / 4,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(8,10,12,0.18)',
  },
  overlayBottomMask: {
    backgroundColor: 'rgba(8,10,12,0.55)',
  },
  cornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 48,
    height: 48,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.primary,
  },
  cornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 48,
    height: 48,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: colors.primary,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 48,
    height: 48,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.primary,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 48,
    height: 48,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: colors.primary,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footerActions: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'android' ? 28 : 24,
    backgroundColor: 'rgba(8,10,12,0.92)',
  },
  footerButtons: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 320,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  importButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  footerConfirmation: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: Platform.OS === 'android' ? 32 : 28,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  confirmationContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  previewLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  previewHint: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  retakeButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  continueButton: {
    marginTop: 12,
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  statusContainer: {
    alignItems: 'center',
    gap: 16,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  errorMessage: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  retryButtonText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    gap: 16,
    justifyContent: 'center',
  },
  permissionTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  permissionBody: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
});
