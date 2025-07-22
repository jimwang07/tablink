'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { receiptService } from '@/services/receipts';
import { ParsedReceiptData } from '@/types/parsedReceipt';
import { generateMockReceiptData } from '@/utils/mockData';
import { formatPrice, formatDate } from '@/utils/formatters';

type Step = 'upload' | 'preview' | 'saving';

export default function CreateReceiptPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceiptData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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

  const handleParseReceipt = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      // Simulate receipt parsing - in production, this would be an actual OCR/AI service
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Use mock JSON data for preview
      const mockParsedReceipt = generateMockReceiptData();
      
      setParsedReceipt(mockParsedReceipt);
      setCurrentStep('preview');
    } catch (error) {
      console.error('Parsing failed:', error);
      alert('Failed to parse receipt. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!parsedReceipt) return;

    setIsSaving(true);
    try {
      const receiptData = await receiptService.createReceipt(parsedReceipt);
      
      // Redirect to bill fronter page with the new receipt
      router.push(`/bill-fronter/${receiptData.id}`);
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save receipt. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReject = () => {
    setCurrentStep('upload');
    setParsedReceipt(null);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Create New Receipt</h1>
        <p className="page-description">
          {currentStep === 'upload' && 'Upload a photo of your receipt to automatically extract items and start splitting the bill with friends'}
          {currentStep === 'preview' && 'Review the extracted receipt details and confirm they are correct'}
          {currentStep === 'saving' && 'Saving your receipt...'}
        </p>
      </div>

      {currentStep === 'upload' && (
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
              onClick={handleParseReceipt}
              disabled={!file || isProcessing}
              className="action-button primary"
            >
              {isProcessing ? 'Processing...' : 'Parse Receipt'}
            </button>
          </div>
        </div>
      )}

      {currentStep === 'preview' && parsedReceipt && (
        <div className="preview-container">
          <div className="receipt-preview">
            <div className="receipt-container">
              <div className="receipt-header">
                <h2 className="restaurant-name">{parsedReceipt.receiptData.merchant_name}</h2>
                <p className="restaurant-address">{parsedReceipt.receiptData.description}</p>
                <p className="receipt-date">{formatDate(parsedReceipt.receiptData.date)}</p>
              </div>
              
              <div className="receipt-items">
                {parsedReceipt.items.map((item) => (
                  <div key={item.id} className="receipt-item">
                    <div className="item-details">
                      <h4 className="item-name">{item.name}</h4>
                    </div>
                    <div className="item-right">
                      <span className="item-price">{formatPrice(item.price)}</span>
                      <span className="item-quantity">Qty: {item.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="receipt-summary">
                <div className="summary-line">
                  <span className="summary-label">Subtotal:</span>
                  <span className="summary-value">{formatPrice(parsedReceipt.receiptData.subtotal)}</span>
                </div>
                <div className="summary-line">
                  <span className="summary-label">Tax:</span>
                  <span className="summary-value">{formatPrice(parsedReceipt.receiptData.tax)}</span>
                </div>
                <div className="summary-line">
                  <span className="summary-label">Tip:</span>
                  <span className="summary-value">{formatPrice(parsedReceipt.receiptData.tip)}</span>
                </div>
                <div className="summary-line total">
                  <span className="summary-label">Total:</span>
                  <span className="summary-value">{formatPrice(parsedReceipt.receiptData.total)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="preview-actions">
            <button 
              onClick={handleReject}
              className="action-button secondary"
            >
              Try Again
            </button>
            <button 
              onClick={handleConfirmReceipt}
              disabled={isSaving}
              className="action-button primary"
            >
              {isSaving ? 'Saving...' : 'Confirm & Create Receipt'}
            </button>
          </div>
        </div>
      )}

      <div className="back-link">
        <Link href="/" className="nav-link">← Back to Home</Link>
      </div>
    </div>
  );
}