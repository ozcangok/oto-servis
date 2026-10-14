import { describe, it, expect } from 'vitest';
import { normalizePlate, formatPlateDisplay, isValidTurkishPlate } from '../src/plate.js';

describe('Turkish License Plate Normalization and Formatting', () => {
  it('normalizes Turkish plates stripping spaces and handling Turkish characters', () => {
    // "34abc123" = "34 ABC 123"
    expect(normalizePlate('34abc123')).toBe('34ABC123');
    expect(formatPlateDisplay('34abc123')).toBe('34 ABC 123');

    // Handling lowercase 'i' -> 'İ' and 'ı' -> 'I'
    expect(normalizePlate('34 İSt 123')).toBe('34İST123');
    expect(normalizePlate('34 ist 123')).toBe('34İST123');
    expect(normalizePlate('06 ılık 45')).toBe('06ILIK45');

    // Stripping punctuation, dashes, spaces
    expect(normalizePlate(' 34-ABC-123. ')).toBe('34ABC123');
    expect(normalizePlate('06/B/1234')).toBe('06B1234');
  });

  it('formats various plate formats for display', () => {
    expect(formatPlateDisplay('34ABC123')).toBe('34 ABC 123');
    expect(formatPlateDisplay('06B1234')).toBe('06 B 1234');
    expect(formatPlateDisplay('35AB1234')).toBe('35 AB 1234');
    expect(formatPlateDisplay('01A0001')).toBe('01 A 0001');
  });

  it('validates Turkish plate format correctly', () => {
    expect(isValidTurkishPlate('34 ABC 123')).toBe(true);
    expect(isValidTurkishPlate('06 B 1234')).toBe(true);
    expect(isValidTurkishPlate('35 AB 1234')).toBe(true);
    expect(isValidTurkishPlate('34ABC123')).toBe(true);
    expect(isValidTurkishPlate('invalid-plate-1234567')).toBe(false);
  });
});
