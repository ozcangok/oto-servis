import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Tek çizgi ikon setinden (lucide) dönen yükleme göstergesi.
 * Emoji yerine kullanılır (bkz. UI yenileme — "İkonlar").
 */
export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = '' }) => (
  <Loader2 className={`spin ${className}`} size={size} strokeWidth={1.75} aria-hidden="true" />
);
