import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ParseResult, Screen } from '@folio-mapper/core';
import { createDebouncedStorage } from './session-storage';

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
  setParseResult: (result: ParseResult | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  goToInput: () => void;
  treatAsFlatList: () => void;
  reset: () => void;
}

const debouncedStorage = createDebouncedStorage();

export const useInputStore = create<InputState>()(
  persist(
    (set, get) => ({
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
        set(
          result
            ? { parseResult: result, screen: 'confirming', isLoading: false, error: null }
            : { parseResult: null, isLoading: false, error: null },
        ),

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
    }),
    {
      name: 'folio-mapper-session-input',
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (state) => ({
        screen: state.screen,
        textInput: state.textInput,
        parseResult: state.parseResult,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<InputState> | undefined;
        if (!p) return current;
        return {
          ...current,
          ...p,
          // Reset transient fields
          selectedFile: null,
          isLoading: false,
          error: null,
        };
      },
    },
  ),
);
