import React, { useEffect, useRef } from 'react';
import { normalizePlate, formatPlateDisplay } from '@oto-servis/shared';

interface PlateInputProps {
  value: string;
  onChange: (val: string) => void;
  onSearch?: (plate: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  enableShortcut?: boolean;
  className?: string;
  id?: string;
  small?: boolean;
  readOnly?: boolean;
}

export const PlateInput: React.FC<PlateInputProps> = ({
  value,
  onChange,
  onSearch,
  placeholder = '34 ABC 123',
  autoFocus = false,
  enableShortcut = true,
  className = '',
  id = 'q',
  small = false,
  readOnly = false
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enableShortcut) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      // Bir metin alanında yazarken kısayol tetiklenmesin (input, textarea,
      // select, açılır liste veya içerik düzenlenebilir alanlar).
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el?.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableShortcut]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const norm = normalizePlate(raw);
    const display = norm.length >= 4 ? formatPlateDisplay(norm) : raw.toUpperCase();
    onChange(display);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      e.preventDefault();
      onSearch(value);
    }
  };

  return (
    <label className={`plate-input ${small ? 'sm' : ''} ${className}`} htmlFor={id}>
      <span className="plate-tr" aria-hidden="true">TR</span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder={placeholder}
        aria-label="Plaka veya müşteri adı"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        autoFocus={autoFocus}
      />
    </label>
  );
};

export const PlateBadge: React.FC<{ plate: string; big?: boolean }> = ({ plate, big = false }) => {
  return (
    <span className={`plate ${big ? 'big' : ''}`}>
      <span className="plate-tr" aria-hidden="true">TR</span>
      <span className="plate-no">{formatPlateDisplay(plate) || plate}</span>
    </span>
  );
};
