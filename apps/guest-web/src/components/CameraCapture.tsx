'use client';

import { useRef, useState, useEffect } from 'react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel: () => void;
}

export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  useEffect(() => {
    startCamera();
    checkCameraDevices();
    return () => stopCamera();
  }, [facingMode]);

  const checkCameraDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setHasMultipleCameras(videoDevices.length > 1);
    } catch (err) {
      console.error('Error checking camera devices:', err);
    }
  };

  const startCamera = async () => {
    try {
      setError(null);
      
      if (streamRef.current) {
        stopCamera();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsStreaming(true);
      }

      streamRef.current = stream;
    } catch (err) {
      console.error('Error accessing camera:', err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission denied. Please allow camera access and try again.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('No camera found. Please ensure your device has a camera.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setError('Camera is already in use by another application.');
        } else {
          setError('Error accessing camera. Please try again.');
        }
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const file = new File([blob], `receipt-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      stopCamera();
      onCapture(file);
    }, 'image/jpeg', 0.8);
  };

  const switchCamera = () => {
    setFacingMode(facingMode === 'user' ? 'environment' : 'user');
  };

  const handleCancel = () => {
    stopCamera();
    onCancel();
  };

  return (
    <div className="camera-capture-container">
      <div className="camera-header">
        <h3>Scan Receipt</h3>
        <button onClick={handleCancel} className="close-button">×</button>
      </div>

      {error ? (
        <div className="camera-error">
          <div className="error-icon">⚠️</div>
          <p>{error}</p>
          <div className="error-actions">
            <button onClick={startCamera} className="action-button primary">
              Try Again
            </button>
            <button onClick={handleCancel} className="action-button secondary">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="camera-preview">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-video"
            />
            <canvas
              ref={canvasRef}
              style={{ display: 'none' }}
            />
            
            {isStreaming && (
              <div className="camera-overlay">
                <div className="scan-frame">
                  <div className="scan-corners">
                    <div className="corner top-left"></div>
                    <div className="corner top-right"></div>
                    <div className="corner bottom-left"></div>
                    <div className="corner bottom-right"></div>
                  </div>
                  <p className="scan-instruction">Position receipt within the frame</p>
                </div>
              </div>
            )}
          </div>

          <div className="camera-controls">
            {hasMultipleCameras && (
              <button
                onClick={switchCamera}
                className="control-button"
                title="Switch camera"
              >
                🔄
              </button>
            )}
            
            <button
              onClick={capturePhoto}
              disabled={!isStreaming}
              className="capture-button"
              title="Capture photo"
            >
              📷
            </button>
            
            <button
              onClick={handleCancel}
              className="control-button"
              title="Cancel"
            >
              ❌
            </button>
          </div>
        </>
      )}
    </div>
  );
}