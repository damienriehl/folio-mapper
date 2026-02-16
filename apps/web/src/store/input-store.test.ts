import { describe, it, expect, beforeEach } from 'vitest';
import { useInputStore } from './input-store';
import type { ParseResult } from '@folio-mapper/core';

const mockFlatResult: ParseResult = {
  format: 'flat',
  items: [
    { text: 'Contract Law', index: 0, ancestry: [] },
    { text: 'Tort Law', index: 1, ancestry: [] },
  ],
  hierarchy: null,
  total_items: 2,
  headers: null,
  source_filename: 'test.csv',
  raw_preview: null,
};

const mockHierarchicalResult: ParseResult = {
  format: 'hierarchical',
  items: [
    { text: 'Securities', index: 0, ancestry: ['Litigation', 'Class Action'] },
    { text: 'Personal Injury', index: 1, ancestry: ['Litigation', 'Individual'] },
  ],
  hierarchy: [
    {
      label: 'Litigation',
      depth: 0,
      children: [
        {
          label: 'Class Action',
          depth: 1,
          children: [{ label: 'Securities', depth: 2, children: [] }],
        },
        {
          label: 'Individual',
          depth: 1,
          children: [{ label: 'Personal Injury', depth: 2, children: [] }],
        },
      ],
    },
  ],
  total_items: 2,
  headers: null,
  source_filename: 'hierarchical.csv',
  raw_preview: null,
};

describe('input-store', () => {
  beforeEach(() => {
    useInputStore.getState().reset();
  });

  it('starts with correct defaults', () => {
    const state = useInputStore.getState();
    expect(state.screen).toBe('input');
    expect(state.textInput).toBe('');
    expect(state.selectedFile).toBeNull();
    expect(state.parseResult).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('setParseResult transitions to confirming screen', () => {
    useInputStore.getState().setParseResult(mockFlatResult);
    const state = useInputStore.getState();
    expect(state.screen).toBe('confirming');
    expect(state.parseResult).toBe(mockFlatResult);
    expect(state.isLoading).toBe(false);
  });

  it('goToInput returns to input screen', () => {
    useInputStore.getState().setParseResult(mockFlatResult);
    useInputStore.getState().goToInput();
    expect(useInputStore.getState().screen).toBe('input');
  });

  it('treatAsFlatList converts hierarchical to flat', () => {
    useInputStore.getState().setParseResult(mockHierarchicalResult);
    useInputStore.getState().treatAsFlatList();

    const state = useInputStore.getState();
    expect(state.parseResult!.format).toBe('flat');
    expect(state.parseResult!.hierarchy).toBeNull();
    expect(state.parseResult!.items[0].ancestry).toEqual([]);
    expect(state.parseResult!.items[0].index).toBe(0);
    expect(state.parseResult!.items[1].index).toBe(1);
  });

  it('treatAsFlatList does nothing for non-hierarchical', () => {
    useInputStore.getState().setParseResult(mockFlatResult);
    useInputStore.getState().treatAsFlatList();
    expect(useInputStore.getState().parseResult!.format).toBe('flat');
  });

  it('reset clears all state', () => {
    useInputStore.getState().setTextInput('hello');
    useInputStore.getState().setParseResult(mockFlatResult);
    useInputStore.getState().reset();

    const state = useInputStore.getState();
    expect(state.screen).toBe('input');
    expect(state.textInput).toBe('');
    expect(state.parseResult).toBeNull();
  });

  it('setLoading clears error', () => {
    useInputStore.getState().setError('some error');
    useInputStore.getState().setLoading(true);
    expect(useInputStore.getState().error).toBeNull();
  });
});
