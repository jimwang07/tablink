'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { receiptService } from '@/services/receipts';
import { storageService } from '@/services/storage';
import { parseReceiptService } from '@/services/parseReceipt';
import { ParsedReceiptData } from '@/types/parsedReceipt';
import { formatPrice, formatDate } from '@/utils/formatters';
import CameraCapture from '@/components/CameraCapture';

type Step = 'upload' | 'processing' | 'preview' | 'saving' | 'success';

export default function CreateReceiptPage() {
  const [file, setFile] = useState<File | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceiptData | null>(null);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', price: '', quantity: '1' });
  const [showCamera, setShowCamera] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<'file' | 'scan'>('file');
  const [processingStep, setProcessingStep] = useState<'uploading' | 'parsing' | null>(null);
  const [newReceiptId, setNewReceiptId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState({ name: '', price: '', quantity: '1' });
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
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleParseReceipt = async () => {
    if (!file) return;

    setCurrentStep('processing');
    setProcessingStep('uploading');
    
    try {
      // Step 0: Test connection (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log('Testing Supabase connection...');
        await storageService.testConnection();
      }
      
      // Step 1: Upload image to Supabase Storage
      console.log('Uploading image to storage...');
      const { url: imageUrl } = await storageService.uploadReceiptImage(file);
      
      // Step 2: Call parseReceipt edge function with image URL
      setProcessingStep('parsing');
      console.log('Parsing receipt with AI...');
      const parsedReceiptData = await parseReceiptService.parseReceiptFromUrl(imageUrl);
      
      // Step 3: Set parsed data and move to preview
      setParsedReceipt(parsedReceiptData);
      setProcessingStep(null);
      setCurrentStep('preview');
    } catch (error) {
      console.error('Parsing failed:', error);
      setProcessingStep(null);
      
      // More detailed error messages
      let errorMessage = 'Failed to parse receipt. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('Storage bucket') || error.message.includes('bucket not found')) {
          errorMessage = 'Storage not configured. Please create the "receipt-images" bucket in Supabase.';
        } else if (error.message.includes('Upload failed') || error.message.includes('upload')) {
          errorMessage = `Upload failed: ${error.message}`;
        } else if (error.message.includes('parse')) {
          errorMessage = 'Failed to parse receipt. The image may be unclear or not a valid receipt.';
        } else {
          errorMessage = error.message;
        }
      }
      
      alert(errorMessage);
      setCurrentStep('upload');
    }
  };

  const handleConfirmReceipt = async () => {
    if (!parsedReceipt) return;

    setCurrentStep('saving');
    try {
      const receiptData = await receiptService.createReceipt(parsedReceipt);
      setNewReceiptId(receiptData.id);
      setCurrentStep('success');
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save receipt. Please try again.');
      setCurrentStep('preview');
    }
  };

  const handleReject = () => {
    setCurrentStep('upload');
    setParsedReceipt(null);
  };

  const handleCameraCapture = (capturedFile: File) => {
    setFile(capturedFile);
    setShowCamera(false);
    setUploadMethod('scan');
  };

  const handleCameraCancel = () => {
    setShowCamera(false);
  };

  const handleScanReceipt = () => {
    setShowCamera(true);
  };

  const handleAddItem = () => {
    if (!parsedReceipt || !newItem.name || !newItem.price) return;

    const newReceiptItem = {
      id: crypto.randomUUID(),
      receipt_id: parsedReceipt.receiptData.id,
      name: newItem.name,
      price: parseFloat(newItem.price),
      quantity: parseInt(newItem.quantity) || 1
    };

    const updatedReceipt = {
      ...parsedReceipt,
      items: [...parsedReceipt.items, newReceiptItem]
    };

    // Recalculate totals
    const newSubtotal = updatedReceipt.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const taxRate = parsedReceipt.receiptData.tax / parsedReceipt.receiptData.subtotal;
    const newTax = newSubtotal * taxRate;
    const newTotal = newSubtotal + newTax + parsedReceipt.receiptData.tip;

    updatedReceipt.receiptData = {
      ...updatedReceipt.receiptData,
      subtotal: newSubtotal,
      tax: newTax,
      total: newTotal
    };

    setParsedReceipt(updatedReceipt);
    setNewItem({ name: '', price: '', quantity: '1' });
    setShowAddItemForm(false);
  };

  const handleDeleteItem = (itemId: string) => {
    if (!parsedReceipt) return;

    const updatedItems = parsedReceipt.items.filter(item => item.id !== itemId);
    const updatedReceipt = {
      ...parsedReceipt,
      items: updatedItems
    };

    // Recalculate totals
    const newSubtotal = updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const taxRate = parsedReceipt.receiptData.tax / parsedReceipt.receiptData.subtotal;
    const newTax = newSubtotal * taxRate;
    const newTotal = newSubtotal + newTax + parsedReceipt.receiptData.tip;

    updatedReceipt.receiptData = {
      ...updatedReceipt.receiptData,
      subtotal: newSubtotal,
      tax: newTax,
      total: newTotal
    };

    setParsedReceipt(updatedReceipt);
  };

  const handleCancelAddItem = () => {
    setNewItem({ name: '', price: '', quantity: '1' });
    setShowAddItemForm(false);
  };

  const handleEditItem = (itemId: string) => {
    if (!parsedReceipt) return;
    
    const itemToEdit = parsedReceipt.items.find(item => item.id === itemId);
    if (itemToEdit) {
      setEditingItemId(itemId);
      setEditingItem({
        name: itemToEdit.name,
        price: itemToEdit.price.toString(),
        quantity: itemToEdit.quantity.toString()
      });
      setShowAddItemForm(false); // Close add form if open
    }
  };

  const handleSaveEditedItem = () => {
    if (!parsedReceipt || !editingItemId) return;

    const updatedItems = parsedReceipt.items.map(item => {
      if (item.id === editingItemId) {
        return {
          ...item,
          name: editingItem.name,
          price: parseFloat(editingItem.price),
          quantity: parseInt(editingItem.quantity) || 1
        };
      }
      return item;
    });

    const updatedReceipt = {
      ...parsedReceipt,
      items: updatedItems
    };

    // Recalculate totals
    const newSubtotal = updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const taxRate = parsedReceipt.receiptData.tax / parsedReceipt.receiptData.subtotal;
    const newTax = newSubtotal * taxRate;
    const newTotal = newSubtotal + newTax + parsedReceipt.receiptData.tip;

    updatedReceipt.receiptData = {
      ...updatedReceipt.receiptData,
      subtotal: newSubtotal,
      tax: newTax,
      total: newTotal
    };

    setParsedReceipt(updatedReceipt);
    setEditingItemId(null);
    setEditingItem({ name: '', price: '', quantity: '1' });
  };

  const handleCancelEditItem = () => {
    setEditingItemId(null);
    setEditingItem({ name: '', price: '', quantity: '1' });
  };

  return (
    <div className="activity-container">
      {/* Back Button */}
      <div className="back-button-container">
        <Link href="/" className="back-button">
          ← Back to Home
        </Link>
      </div>

      {currentStep === 'upload' && (
        <div className="scan-hero-section">
          <div className="scan-hero-icon">
            <img src="/scanner-light.svg" alt="Scanner" width="80" height="80" />
          </div>
          <h1 className="scan-hero-title">Scan Your Receipt</h1>
          <p className="scan-hero-description">
            Upload a photo to automatically extract items and split the bill.
          </p>
        </div>
      )}
      
      {currentStep !== 'upload' && (
        <div className="page-header">
          <h1 className="page-title">Creating New Receipt</h1>
          <p className="page-description">
            {currentStep === 'processing' && (
              processingStep === 'uploading' ? 'Uploading your receipt image...' :
              processingStep === 'parsing' ? 'Analyzing receipt with AI...' :
              'Processing your receipt...'
            )}
            {currentStep === 'preview' && 'Review the extracted receipt details, add or remove items, and confirm they are correct'}
            {currentStep === 'saving' && 'Saving your receipt...'}
            {currentStep === 'success' && 'Receipt created! Share the link with your friends.'}
          </p>
        </div>
      )}

      {currentStep === 'upload' && !showCamera && (
        <div className="upload-section">
          <div className="upload-actions">
            <button 
              onClick={handleScanReceipt}
              className="hero-action-button"
            >
              <span>📷</span>
              Use Camera
            </button>
            <div className="upload-divider">
              <span>or</span>
            </div>
          </div>
          
          <div 
            className="upload-dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
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
                  <p className="upload-method">
                    {uploadMethod === 'scan' ? 'Captured with camera' : 'Uploaded from files'}
                  </p>
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
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFileSelect(e.target.files[0]);
                        setUploadMethod('file');
                      }
                    }}
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
                onClick={() => {
                  setFile(null);
                  setUploadMethod('file');
                }}
                className="action-button secondary"
              >
                Remove File
              </button>
            )}
            <button 
              onClick={handleParseReceipt}
              disabled={!file || currentStep === ('processing' as Step)}
              className="action-button primary"
            >
              {currentStep === ('processing' as Step) ? 'Processing...' : 'Parse Receipt'}
            </button>
          </div>
        </div>
      )}

      {currentStep === 'processing' && (
        <div className="processing-container">
          <div className="processing-animation">
            <div className="scanner-loading">
              <img src="/scanner-light.svg" alt="Scanner" width="80" height="80" />
              <div className="scanning-line"></div>
            </div>
            <div className="processing-steps">
              <div className={`processing-step ${processingStep === 'uploading' ? 'active' : processingStep === 'parsing' ? 'completed' : ''}`}>
                <div className="step-indicator">
                  {processingStep === 'uploading' ? (
                    <div className="loading-spinner"></div>
                  ) : (
                    <div className="step-check">✓</div>
                  )}
                </div>
                <span>Uploading image...</span>
              </div>
              <div className={`processing-step ${processingStep === 'parsing' ? 'active' : ''}`}>
                <div className="step-indicator">
                  {processingStep === 'parsing' ? (
                    <div className="loading-spinner"></div>
                  ) : (
                    <div className="step-number">2</div>
                  )}
                </div>
                <span>Analyzing receipt with AI...</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentStep === 'upload' && showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onCancel={handleCameraCancel}
        />
      )}

      {currentStep === 'preview' && parsedReceipt && (
        <div className="preview-container">
          <div className="receipt-preview-card">
            <div className="receipt-card-header">
              <div className="receipt-merchant-info">
                <div className="merchant-icon">🍽️</div>
                <div className="merchant-details">
                  <h2 className="merchant-name">{parsedReceipt.receiptData.merchant_name}</h2>
                  <p className="merchant-description">{parsedReceipt.receiptData.description}</p>
                  <p className="receipt-date">{formatDate(parsedReceipt.receiptData.date)}</p>
                </div>
              </div>
              <div className="receipt-total-badge">
                <span className="total-label">Total</span>
                <span className="total-amount">{formatPrice(parsedReceipt.receiptData.total)}</span>
              </div>
            </div>
            
            <div className="receipt-items-section">
              <div className="items-header">
                <h3 className="items-title">Items ({parsedReceipt.items.length})</h3>
                <button
                  onClick={() => setShowAddItemForm(true)}
                  className="add-item-button"
                  disabled={showAddItemForm || editingItemId !== null}
                >
                  <span>+</span>
                  Add Item
                </button>
              </div>
              
              <div className="items-list">
                {parsedReceipt.items.map((item) => (
                  <div key={item.id} className="preview-item">
                    {editingItemId === item.id ? (
                      <div className="edit-item-form">
                        <div className="form-content">
                          <div className="form-group">
                            <label>Item Name</label>
                            <input
                              type="text"
                              value={editingItem.name}
                              onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                              placeholder="Enter item name"
                              className="form-input"
                            />
                          </div>
                          <div className="form-row">
                            <div className="form-group">
                              <label>Price</label>
                              <input
                                type="number"
                                step="0.01"
                                value={editingItem.price}
                                onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })}
                                placeholder="0.00"
                                className="form-input"
                              />
                            </div>
                            <div className="form-group">
                              <label>Quantity</label>
                              <input
                                type="number"
                                min="1"
                                value={editingItem.quantity}
                                onChange={(e) => setEditingItem({ ...editingItem, quantity: e.target.value })}
                                className="form-input"
                              />
                            </div>
                          </div>
                          <div className="form-actions">
                            <button
                              onClick={handleSaveEditedItem}
                              className="action-button primary small"
                              disabled={!editingItem.name || !editingItem.price}
                            >
                              Save Changes
                            </button>
                            <button
                              onClick={handleCancelEditItem}
                              className="action-button secondary small"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="item-content">
                          <div className="item-name">{item.name}</div>
                          <div className="item-details">
                            <span className="item-quantity">Qty: {item.quantity}</span>
                            <span className="item-price">{formatPrice(item.price)}</span>
                          </div>
                        </div>
                        <div className="item-actions">
                          <button
                            onClick={() => handleEditItem(item.id)}
                            className="edit-item-btn"
                            title="Edit item"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="delete-item-btn"
                            title="Delete item"
                          >
                            🗑️
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              
              {showAddItemForm && (
                <div className="add-item-form-card">
                  <div className="form-header">
                    <h4>Add New Item</h4>
                    <button
                      onClick={handleCancelAddItem}
                      className="form-close-btn"
                    >
                      ×
                    </button>
                  </div>
                  <div className="form-content">
                    <div className="form-group">
                      <label>Item Name</label>
                      <input
                        type="text"
                        value={newItem.name}
                        onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                        placeholder="Enter item name"
                        className="form-input"
                      />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Price</label>
                        <input
                          type="number"
                          step="0.01"
                          value={newItem.price}
                          onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                          placeholder="0.00"
                          className="form-input"
                        />
                      </div>
                      <div className="form-group">
                        <label>Quantity</label>
                        <input
                          type="number"
                          min="1"
                          value={newItem.quantity}
                          onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                          className="form-input"
                        />
                      </div>
                    </div>
                    <div className="form-actions">
                      <button
                        onClick={handleAddItem}
                        className="action-button primary"
                        disabled={!newItem.name || !newItem.price}
                      >
                        Add Item
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="receipt-summary-section">
              <div className="summary-header">
                <h3 className="summary-title">Receipt Summary</h3>
              </div>
              <div className="summary-breakdown">
                <div className="summary-line">
                  <span className="summary-label">Subtotal</span>
                  <span className="summary-value">{formatPrice(parsedReceipt.receiptData.subtotal)}</span>
                </div>
                <div className="summary-line">
                  <span className="summary-label">Tax</span>
                  <span className="summary-value">{formatPrice(parsedReceipt.receiptData.tax)}</span>
                </div>
                <div className="summary-line">
                  <span className="summary-label">Tip</span>
                  <span className="summary-value">{formatPrice(parsedReceipt.receiptData.tip)}</span>
                </div>
                <div className="summary-line total-line">
                  <span className="summary-label">Total</span>
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
              ← Try Again
            </button>
            <button 
              onClick={handleConfirmReceipt}
              disabled={currentStep === ('saving' as Step)}
              className="action-button primary"
            >
              {currentStep === ('saving' as Step) ? 'Saving...' : 'Create Receipt →'}
            </button>
          </div>
        </div>
      )}

      {currentStep === 'success' && newReceiptId && (
        <div className="success-container">
          <div className="success-card">
            <div className="success-icon">
              ✅
            </div>
            <h2 className="success-title">Receipt Created Successfully!</h2>
            <p className="success-description">
              Your receipt has been created and is ready to be shared. Friends can claim their items and pay you directly.
            </p>
            
            <div className="share-section">
              <div className="share-header">
                <h3 className="share-title">Share with Friends</h3>
                <p className="share-subtitle">Send this link to let friends claim their items</p>
              </div>
              
              <div className="link-container">
                <input
                  type="text"
                  value={`${window.location.origin}/item-claimer/${newReceiptId}`}
                  readOnly
                  className="share-link-input"
                  onFocus={e => e.target.select()}
                />
                <button
                  className="copy-link-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/item-claimer/${newReceiptId}`);
                    // TODO: Replace with toast notification
                    alert('Link copied to clipboard!');
                  }}
                  title="Copy link"
                >
                  📋
                </button>
              </div>
            </div>
            
            <div className="success-actions">
              <button
                className="action-button primary"
                onClick={() => router.push(`/bill-fronter/${newReceiptId}`)}
              >
                📊 View Receipt
              </button>
              <button
                className="action-button secondary"
                onClick={() => router.push('/')}
              >
                🏠 Back to Home
              </button>
            </div>
            
            <div className="next-steps">
              <h4 className="next-steps-title">What's Next?</h4>
              <ul className="next-steps-list">
                <li>Share the link with friends who were at the meal</li>
                <li>Friends can claim items and pay their portion</li>
                <li>Track payments in your dashboard</li>
              </ul>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}