'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/libs/supabase';

type Step = 'upload' | 'preview' | 'saving';

interface ParsedReceiptData {
  receiptData: {
    id: string;
    created_by: string;
    merchant_name: string;
    description: string;
    date: string;
    subtotal: number;
    tax: number;
    tip: number;
    total: number;
    status: string;
    share_link: string;
  };
  items: {
    id: string;
    receipt_id: string;
    name: string;
    price: number;
    quantity: number;
  }[];
}

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
      const mockParsedReceipt = {
        receiptData: {
          id: "1d1c488a-915f-4548-bffc-0740087b67b4",
          created_by: '$sarah',
          merchant_name: 'Tony\'s Italian',
          description: 'Team dinner',
          date: '2025-07-20T19:30:00',
          subtotal: 93.00,
          tax: 7.44,
          tip: 18.60,
          total: 119.04,
          status: 'partially_claimed',
          share_link: `cashlink.app/r/${Math.random().toString(36).substring(2, 10)}`
        },
        items: [
          {
            id: "a8f37bb5-631e-47db-b594-f1b788163fb8",
            receipt_id: "1d1c488a-915f-4548-bffc-0740087b67b4",
            name: 'Caesar Salad',
            price: 12.99,
            quantity: 1
          },
          {
            id: "df05843c-d252-47e9-9c34-fbe9fd36c7be",
            receipt_id: "1d1c488a-915f-4548-bffc-0740087b67b4",
            name: 'Grilled Chicken Sandwich',
            price: 16.99,
            quantity: 1
          },
          {
            id: "f951f7a8-f90c-4dc7-87f4-b6f4897876cf",
            receipt_id: "1d1c488a-915f-4548-bffc-0740087b67b4",
            name: 'Margherita Pizza',
            price: 15.52,
            quantity: 1
          }
        ]
      };
      
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
      // First, insert the receipt column by column
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .insert([{
          id: parsedReceipt.receiptData.id,
          created_by: parsedReceipt.receiptData.created_by,
          merchant_name: parsedReceipt.receiptData.merchant_name,
          description: parsedReceipt.receiptData.description,
          date: parsedReceipt.receiptData.date,
          subtotal: parsedReceipt.receiptData.subtotal,
          tax: parsedReceipt.receiptData.tax,
          tip: parsedReceipt.receiptData.tip,
          total: parsedReceipt.receiptData.total,
          status: parsedReceipt.receiptData.status,
          share_link: parsedReceipt.receiptData.share_link
        }])

      if (receiptError) {
        console.error('Receipt insert error:', receiptError);
        throw new Error('Failed to save receipt');
      }

      // Then, insert the receipt items column by column
      const itemsToInsert = parsedReceipt.items.map(item => ({
        id: item.id,
        receipt_id: item.receipt_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      }));

      const { error: itemsError } = await supabase
        .from('receipt_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Items insert error:', itemsError);
        throw new Error('Failed to save receipt items');
      }

      // Redirect to bill fronter page with the new receipt
      router.push(`/bill-fronter/${parsedReceipt.receiptData.id}`);
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

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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