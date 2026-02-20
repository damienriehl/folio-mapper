import { useState, useEffect, useCallback, useRef } from 'react';
import { SESSION_VERSION, validateSession } from '@folio-mapper/core';
import type { SessionFile } from '@folio-mapper/core';
import { useInputStore } from '../store/input-store';
import { useMappingStore } from '../store/mapping-store';
import { useLLMStore } from '../store/llm-store';

const MAPPING_STORAGE_KEY = 'folio-mapper-session-mapping';
const INPUT_STORAGE_KEY = 'folio-mapper-session-input';

export function useSession() {
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [rehydrated, setRehydrated] = useState(false);
  const checkedRef = useRef(false);

  // Wait for both stores to rehydrate before checking for session
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    let mappingReady = false;
    let inputReady = false;

    const check = () => {
      if (mappingReady && inputReady) {
        setRehydrated(true);
      }
    };

    // Zustand persist fires onRehydrateStorage synchronously on subscribe
    const mappingUnsub = useMappingStore.persist.onFinishHydration(() => {
      mappingReady = true;
      check();
    });
    const inputUnsub = useInputStore.persist.onFinishHydration(() => {
      inputReady = true;
      check();
    });

    unsubs.push(mappingUnsub, inputUnsub);

    // Also check if already rehydrated (may have fired before effect ran)
    if (useMappingStore.persist.hasHydrated()) mappingReady = true;
    if (useInputStore.persist.hasHydrated()) inputReady = true;
    check();

    return () => unsubs.forEach((u) => u());
  }, []);

  // Once rehydrated, check if there's a session to recover
  useEffect(() => {
    if (!rehydrated || checkedRef.current) return;
    checkedRef.current = true;

    const mappingState = useMappingStore.getState();
    if (mappingState.mappingResponse !== null) {
      setShowRecoveryModal(true);
    }
  }, [rehydrated]);

  // beforeunload warning when session is active
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const { mappingResponse } = useMappingStore.getState();
      if (mappingResponse) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Ctrl+S handler for manual save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const { mappingResponse } = useMappingStore.getState();
        if (mappingResponse) {
          downloadSession();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const buildSessionFile = useCallback((): SessionFile => {
    const mapping = useMappingStore.getState();
    const input = useInputStore.getState();
    const llm = useLLMStore.getState();
    const activeConfig = llm.configs[llm.activeProvider];

    const completedCount = Object.values(mapping.nodeStatuses).filter((s) => s === 'completed').length;
    const skippedCount = Object.values(mapping.nodeStatuses).filter((s) => s === 'skipped').length;

    return {
      version: SESSION_VERSION,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      source_file: input.parseResult?.source_filename ?? null,
      input_format: input.parseResult?.format ?? null,
      total_nodes: mapping.totalItems,
      completed: completedCount,
      skipped: skippedCount,
      current_position: mapping.currentItemIndex,

      provider: llm.activeProvider,
      model: activeConfig?.model ?? null,

      text_input: input.textInput,
      parse_result: input.parseResult,
      mapping_response: mapping.mappingResponse,
      pipeline_metadata: mapping.pipelineMetadata,

      selections: mapping.selections,
      node_statuses: mapping.nodeStatuses,
      notes: mapping.notes,
      screen: input.screen,

      branch_states: mapping.branchStates,
      input_branch_states: mapping.inputBranchStates,
      branch_sort_mode: mapping.branchSortMode,
      custom_branch_order: mapping.customBranchOrder,
      status_filter: mapping.statusFilter,

      suggestion_queue: mapping.suggestionQueue,
      review_queue: mapping.reviewQueue,
    };
  }, []);

  const downloadSession = useCallback(() => {
    const session = buildSessionFile();
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `folio-session-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [buildSessionFile]);

  const clearStores = useCallback(() => {
    useMappingStore.getState().resetMapping();
    useInputStore.getState().reset();
    // Clear persisted storage
    localStorage.removeItem(MAPPING_STORAGE_KEY);
    localStorage.removeItem(INPUT_STORAGE_KEY);
  }, []);

  const handleResume = useCallback(() => {
    setShowRecoveryModal(false);
  }, []);

  const handleStartFresh = useCallback(() => {
    clearStores();
    setShowRecoveryModal(false);
  }, [clearStores]);

  const handleDownloadSession = useCallback(() => {
    downloadSession();
  }, [downloadSession]);

  const handleNewProject = useCallback(() => {
    setShowNewProjectModal(true);
  }, []);

  const handleSaveAndNew = useCallback(() => {
    downloadSession();
    clearStores();
    setShowNewProjectModal(false);
  }, [downloadSession, clearStores]);

  const handleDiscardAndNew = useCallback(() => {
    clearStores();
    setShowNewProjectModal(false);
  }, [clearStores]);

  const handleCancelNewProject = useCallback(() => {
    setShowNewProjectModal(false);
  }, []);

  const handleLoadSessionFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const session = validateSession(data);
      if (!session) {
        throw new Error('Invalid session file format');
      }

      // Hydrate input store
      const inputStore = useInputStore.getState();
      if (session.text_input) inputStore.setTextInput(session.text_input);
      if (session.parse_result) inputStore.setParseResult(session.parse_result);
      if (session.screen) inputStore.setScreen(session.screen);

      // Hydrate mapping store
      const mappingStore = useMappingStore.getState();
      if (session.mapping_response) {
        mappingStore.setMappingResponse(session.mapping_response);

        // Restore user progress via direct set
        useMappingStore.setState({
          currentItemIndex: session.current_position,
          selections: session.selections ?? {},
          nodeStatuses: session.node_statuses ?? {},
          notes: session.notes ?? {},
          branchStates: session.branch_states ?? {},
          inputBranchStates: session.input_branch_states ?? {},
          branchSortMode: session.branch_sort_mode ?? 'default',
          customBranchOrder: session.custom_branch_order ?? [],
          statusFilter: session.status_filter ?? 'all',
          pipelineMetadata: session.pipeline_metadata ?? null,
          suggestionQueue: session.suggestion_queue ?? [],
          reviewQueue: session.review_queue ?? [],
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load session file';
      useInputStore.getState().setError(msg);
    }
  }, []);

  const hasActiveSession = useMappingStore((s) => s.mappingResponse !== null);

  return {
    showRecoveryModal,
    showNewProjectModal,
    hasActiveSession,
    handleResume,
    handleStartFresh,
    handleDownloadSession,
    handleNewProject,
    handleSaveAndNew,
    handleDiscardAndNew,
    handleCancelNewProject,
    handleLoadSessionFile,
    downloadSession,

    // Recovery modal data
    getRecoveryData: () => {
      const mapping = useMappingStore.getState();
      const completedCount = Object.values(mapping.nodeStatuses).filter((s) => s === 'completed').length;
      const skippedCount = Object.values(mapping.nodeStatuses).filter((s) => s === 'skipped').length;
      // Try to find a "created" date from localStorage
      let created = new Date().toISOString();
      try {
        const raw = localStorage.getItem(MAPPING_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.state?.updated) created = parsed.state.updated;
        }
      } catch { /* ignore */ }
      return {
        created,
        totalNodes: mapping.totalItems,
        completedCount,
        skippedCount,
      };
    },
  };
}
