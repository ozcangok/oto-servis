import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Keyboard } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Kamera ile Barkod Okut'
}) => {
  const [manualInput, setManualInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerElementId = 'html5-qrcode-reader';

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    const startScanner = async () => {
      try {
        setErrorMsg(null);
        const html5QrCode = new Html5Qrcode(readerElementId);
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 180 }
          },
          (decodedText) => {
            // Success
            handleDetected(decodedText);
          },
          () => {
            // Frame parse error (ignored)
          }
        );
        setIsCameraActive(true);
      } catch (err: any) {
        console.warn('Camera start failed:', err);
        setErrorMsg('Kamera açılamadı veya izin verilmedi. Aşağıdan barkodu elle girebilirsiniz.');
        setIsCameraActive(false);
      }
    };

    const timer = setTimeout(() => {
      startScanner();
    }, 200);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen]);

  const stopScanner = () => {
    if (scannerRef.current && isCameraActive) {
      scannerRef.current.stop().catch(() => {}).finally(() => {
        scannerRef.current = null;
        setIsCameraActive(false);
      });
    }
  };

  const handleDetected = (barcode: string) => {
    stopScanner();
    onScan(barcode.trim());
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      handleDetected(manualInput.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem'
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--bg-surface)',
          padding: '1.25rem',
          borderRadius: 'var(--radius-lg)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
            <Camera size={20} color="var(--accent-primary)" />
            {title}
          </h3>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              stopScanner();
              onClose();
            }}
          >
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {errorMsg}
          </div>
        )}

        {/* Viewfinder element */}
        <div
          id={readerElementId}
          style={{
            width: '100%',
            minHeight: '240px',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            backgroundColor: '#000000',
            marginBottom: '1rem'
          }}
        />

        {/* Manual Barcode fallback */}
        <form onSubmit={handleManualSubmit} style={{ marginTop: '0.5rem' }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Keyboard size={15} />
            Veya Barkodu Klavyeden Girin:
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="form-input"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Barkod no (ör: 8690123456781)"
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={!manualInput.trim()}>
              Ekle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
