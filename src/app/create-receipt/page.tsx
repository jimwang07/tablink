'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CreateReceiptPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const router = useRouter();

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile.type.startsWith('image/')) {
      setFile(selectedFile);
    } else {
      alert('Please select an image file');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    try {
      // TODO: Implement actual receipt parsing/upload
      // For now, simulate upload delay
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Create New Receipt</h1>
        <p className="page-description">
          Upload a photo of your receipt to automatically extract items and start splitting the bill with friends
        </p>
      </div>

      <div className="upload-container">
        <div 
          className={`upload-dropzone ${dragOver ? 'drag-over' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {file ? (
            <div className="file-preview">
              <img 
                src={URL.createObjectURL(file)} 
                alt="Receipt preview" 
                className="preview-image"
              />
              <div className="file-info">
                <p className="file-name">{file.name}</p>
                <p className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
          ) : (
            <div className="upload-placeholder">
              <div className="upload-icon">📄</div>
              <h3>Drop your receipt here</h3>
              <p>or</p>
              <label className="file-input-label">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="file-input"
                />
                Choose File
              </label>
            </div>
          )}
        </div>

        <div className="upload-actions">
          {file && (
            <button 
              onClick={() => setFile(null)}
              className="action-button secondary"
            >
              Remove File
            </button>
          )}
          <button 
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="action-button primary"
          >
            {isUploading ? 'Processing...' : 'Upload Receipt'}
          </button>
        </div>
      </div>

      <div className="back-link">
        <Link href="/" className="nav-link">← Back to Home</Link>
      </div>
    </div>
  );
}