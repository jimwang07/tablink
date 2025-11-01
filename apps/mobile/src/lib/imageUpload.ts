import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { getSupabaseClient } from './supabaseClient';

// what we hand back to the caller
export type UploadReceiptResult = {
  storagePath: string;           // e.g. "user_123/1730000000000.jpg"
  publicUrl: string | null;      // likely null now because bucket is private
  localPreviewUri: string;       // downsized local file we just created (use this for UI if you want)
};

const BUCKET = 'receipts'; // single bucket now
const MAX_WIDTH = 1200;    // aggressive downsize target
const JPEG_QUALITY = 0.7;  // ~0.6-0.7 is usually fine for receipts

export async function uploadReceiptImage(localUri: string, userId: string): Promise<UploadReceiptResult> {
  const client = getSupabaseClient();

  // Make sure the original picture exists
  const fileInfo = await FileSystem.getInfoAsync(localUri);
  if (!fileInfo.exists) {
    throw new Error('Receipt image not found on device');
  }

  // 1. Always downsize and recompress to a stable jpeg so uploads are predictable & small
  const resizeStart = Date.now();
  const manipulated = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: MAX_WIDTH } }],
    {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  const resizeDuration = Date.now() - resizeStart;
  console.log(`[perf][uploadReceiptImage] resize+compress ${resizeDuration}ms`);

  // manipulated.uri is our downsized preview that we are now treating as THE receipt
  const downsizedUri = manipulated.uri;

  // 2. Read that downsized file as base64 -> Uint8Array for Supabase upload
  const base64Data = await FileSystem.readAsStringAsync(downsizedUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const fileBytes = base64ToUint8Array(base64Data);

  // 3. Create a predictable storage key
  const now = Date.now();
  const filename = `${now}.jpg`; // always jpg now
  const storagePath = `${userId}/${filename}`;

  // 4. Upload to the single private bucket
  const uploadStart = Date.now();
  const { error: uploadError } = await client.storage
    .from(BUCKET)
    .upload(storagePath, fileBytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });
  const uploadDuration = Date.now() - uploadStart;
  console.log(
    `[perf][uploadReceiptImage] upload ${uploadDuration}ms (bytes=${fileBytes.length})`
  );

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  // 5. Optional: try to get a public URL (will be null-ish if bucket is private)
  let publicUrl: string | null = null;
  try {
    const { data } = client.storage.from(BUCKET).getPublicUrl(storagePath);
    publicUrl = data?.publicUrl ?? null;
  } catch {
    publicUrl = null;
  }

  return {
    storagePath,
    publicUrl,
    localPreviewUri: downsizedUri,
  };
}

// helper
function base64ToUint8Array(base64: string): Uint8Array {
  // React Native / Expo usually polyfills atob. If you hit "atob not defined",
  // import { decode as atob } from 'base-64' and use that instead.
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
