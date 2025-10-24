import * as FileSystem from 'expo-file-system';

import { getSupabaseClient } from './supabaseClient';

export type UploadReceiptResult = {
  storagePath: string;
  publicUrl: string;
};

export async function uploadReceiptImage(localUri: string, userId: string): Promise<UploadReceiptResult> {
  const client = getSupabaseClient();

  const extension = guessExtension(localUri);
  const filename = `${Date.now()}.${extension}`;
  const storagePath = `${userId}/${filename}`;

  const fileInfo = await FileSystem.getInfoAsync(localUri);
  if (!fileInfo.exists) {
    throw new Error('Receipt image not found on device');
  }

  const fileBuffer = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const fileBytes = Uint8Array.from(atob(fileBuffer), (c) => c.charCodeAt(0));

  const { error: uploadError } = await client.storage
    .from('receipts')
    .upload(storagePath, fileBytes, {
      contentType: contentTypeForExtension(extension),
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = client.storage
    .from('receipts')
    .getPublicUrl(storagePath);

  if (!data?.publicUrl) {
    throw new Error('Failed to generate image URL');
  }

  return {
    storagePath,
    publicUrl: data.publicUrl,
  };
}

function guessExtension(uri: string): string {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }
  return 'jpg';
}

function contentTypeForExtension(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'heic':
      return 'image/heic';
    case 'webp':
      return 'image/webp';
    case 'jpeg':
    case 'jpg':
    default:
      return 'image/jpeg';
  }
}
