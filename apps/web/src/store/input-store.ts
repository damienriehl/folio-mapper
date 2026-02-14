import { create } from 'zustand';
import type { ParseResult, Screen } from '@folio-mapper/core';

interface InputState {
  screen: Screen;
  textInput: string;
  selectedFile: File | null;
  parseResult: ParseResult | null;
  isLoading: boolean;
  error: string | null;

  setScreen: (screen: Screen) => void;
  setTextInput: (text: string) => void;
  setSelectedFile: (file: File | null) => void;
  setParseResult: (result: ParseResult) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  goToInput: () => void;
  treatAsFlatList: () => void;
  reset: () => void;
}

export const useInputStore = create<InputState>((set, get) => ({
  screen: 'input',
  textInput: '',
  selectedFile: null,
  parseResult: null,
  isLoading: false,
  error: null,

  setScreen: (screen) => set({ screen }),
  setTextInput: (text) => set({ textInput: text }),
  setSelectedFile: (file) => set({ selectedFile: file }),

  setParseResult: (result) =>
    set({
      parseResult: result,
      screen: 'confirming',
      isLoading: false,
      error: null,
    }),

  setLoading: (loading) => set({ isLoading: loading, error: null }),
  setError: (error) => set({ error, isLoading: false }),

  goToInput: () => set({ screen: 'input' }),

  treatAsFlatList: () => {
    const { parseResult } = get();
    if (!parseResult || parseResult.format !== 'hierarchical') return;

    set({
      parseResult: {
        ...parseResult,
        format: 'flat',
        hierarchy: null,
        items: parseResult.items.map((item, i) => ({
          ...item,
          index: i,
          ancestry: [],
        })),
      },
    });
  },

  reset: () =>
    set({
      screen: 'input',
      textInput: '',
      selectedFile: null,
      parseResult: null,
      isLoading: false,
      error: null,
    }),
}));
