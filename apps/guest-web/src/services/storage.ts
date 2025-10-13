import { supabase } from '@/libs/supabase';

export interface UploadImageResult {
  url: string;
  path: string;
}

export const storageService = {
  async uploadReceiptImage(file: File): Promise<UploadImageResult> {
    try {
      // Generate unique filename with timestamp
      const timestamp = new Date().getTime();
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const fileName = `receipt_${timestamp}.${fileExtension}`;
      const filePath = `receipts/${fileName}`;

      console.log('Uploading file:', fileName, 'Size:', file.size, 'Type:', file.type);

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from('receipt-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Upload error details:', error);
        // Provide more specific error messages
        if (error.message.includes('Bucket not found')) {
          throw new Error('Storage bucket not found. Please contact support.');
        } else if (error.message.includes('permissions')) {
          throw new Error('Storage permission denied. Please contact support.');
        } else if (error.message.includes('size')) {
          throw new Error('File too large. Please use a smaller image.');
        } else {
          throw new Error(`Upload failed: ${error.message}`);
        }
      }

      console.log('Upload successful:', data);

      // Get public URL for the uploaded image
      const { data: { publicUrl } } = supabase.storage
        .from('receipt-images')
        .getPublicUrl(filePath);

      console.log('Public URL:', publicUrl);

      return {
        url: publicUrl,
        path: filePath
      };
    } catch (error) {
      console.error('Image upload error:', error);
      throw error;
    }
  },

  async deleteReceiptImage(path: string): Promise<boolean> {
    try {
      const { error } = await supabase.storage
        .from('receipt-images')
        .remove([path]);

      if (error) {
        throw new Error(`Failed to delete image: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error('Image deletion error:', error);
      throw error;
    }
  },

  async getImageUrl(path: string): Promise<string> {
    try {
      const { data: { publicUrl } } = supabase.storage
        .from('receipt-images')
        .getPublicUrl(path);

      return publicUrl;
    } catch (error) {
      console.error('Get image URL error:', error);
      throw error;
    }
  },

  // Test basic Supabase connection
  async testConnection(): Promise<void> {
    try {
      console.log('Testing basic Supabase connection...');
      
      // Test database connection first
      const { data: testData, error: testError } = await supabase
        .from('receipts')
        .select('count')
        .limit(1);
      
      if (testError) {
        console.error('Database connection failed:', testError);
        throw new Error(`Database connection failed: ${testError.message}`);
      }
      
      console.log('✅ Database connection successful');
      
      // Now test storage connection
      const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
      
      if (storageError) {
        console.error('Storage connection failed:', storageError);
        throw new Error(`Storage connection failed: ${storageError.message}`);
      }
      
      console.log('✅ Storage connection successful');
      console.log('Available buckets:', buckets?.map(b => ({ name: b.name, id: b.id, public: b.public })) || []);
      console.log('Raw buckets response:', buckets);
      
    } catch (error) {
      console.error('Connection test failed:', error);
      throw error;
    }
  },

  // Debug function to check storage setup
  async testStorageSetup(): Promise<void> {
    try {
      console.log('Testing storage setup...');
      console.log('Supabase client config check...');
      
      // Try to list buckets
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (bucketsError) {
        console.error('Error listing buckets:', bucketsError);
        console.error('Error details:', JSON.stringify(bucketsError, null, 2));
        throw new Error(`Storage access error: ${bucketsError.message}`);
      }
      
      console.log('Available buckets:', buckets?.map(b => ({ name: b.name, public: b.public })));
      
      // Check if our bucket exists
      const receiptImagesBucket = buckets?.find(bucket => bucket.name === 'receipt-images');
      if (!receiptImagesBucket) {
        console.error('receipt-images bucket not found');
        console.error('Available bucket names:', buckets?.map(b => b.name));
        throw new Error('Storage bucket "receipt-images" does not exist. Please create it in your Supabase dashboard.');
      }
      
      console.log('receipt-images bucket found:', receiptImagesBucket);
      
      // Try to list files in the bucket
      const { data: files, error: filesError } = await supabase.storage
        .from('receipt-images')
        .list('', { limit: 1 });
        
      if (filesError) {
        console.error('Error accessing bucket contents:', filesError);
        console.error('Files error details:', JSON.stringify(filesError, null, 2));
        throw new Error(`Bucket access error: ${filesError.message}`);
      }
      
      console.log('Storage setup test passed! Files count:', files?.length || 0);
    } catch (error) {
      console.error('Storage setup test failed:', error);
      throw error;
    }
  }
};