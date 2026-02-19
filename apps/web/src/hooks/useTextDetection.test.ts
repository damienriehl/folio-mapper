import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTextDetection } from './useTextDetection';

describe('useTextDetection', () => {
  it('returns 0 for empty text', () => {
    const { result } = renderHook(() => useTextDetection(''));
    expect(result.current.itemCount).toBe(0);
  });

  it('returns 0 for whitespace only', () => {
    const { result } = renderHook(() => useTextDetection('   \n  \n  '));
    expect(result.current.itemCount).toBe(0);
  });

  it('counts non-empty lines', () => {
    const { result } = renderHook(() => useTextDetection('A\nB\nC'));
    expect(result.current.itemCount).toBe(3);
  });

  it('skips blank lines', () => {
    const { result } = renderHook(() => useTextDetection('A\n\nB\n  \nC'));
    expect(result.current.itemCount).toBe(3);
  });

  it('counts single line', () => {
    const { result } = renderHook(() => useTextDetection('Hello'));
    expect(result.current.itemCount).toBe(1);
  });

  it('detects tab-delimited text as tabular', () => {
    const { result } = renderHook(() => useTextDetection('Insurance\tFinance\nContract\tParty'));
    expect(result.current.isTabular).toBe(true);
  });

  it('detects plain text as non-tabular', () => {
    const { result } = renderHook(() => useTextDetection('Contract Law\nTort Law'));
    expect(result.current.isTabular).toBe(false);
  });

  it('detects empty text as non-tabular', () => {
    const { result } = renderHook(() => useTextDetection(''));
    expect(result.current.isTabular).toBe(false);
  });
});
