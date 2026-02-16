import { useState, useEffect, useRef } from 'react';
import { parseText, testConnection, fetchModels, BRANCH_COLORS } from '@folio-mapper/core';
import {
  AppShell,
  InputScreen,
  TextInput,
  FileDropZone,
  ConfirmationScreen,
  MappingScreen,
  Header,
  LLMSettings,
  BranchOptionsPanel,
} from '@folio-mapper/ui';
import { useInputStore } from './store/input-store';
import { useMappingStore } from './store/mapping-store';
import { useLLMStore } from './store/llm-store';
import { useFileUpload } from './hooks/useFileUpload';
import { useTextDetection } from './hooks/useTextDetection';
import { useFolioWarmup } from './hooks/useFolioWarmup';
import { useMapping } from './hooks/useMapping';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export function App() {
  const {
    screen: rawScreen,
    textInput,
    selectedFile,
    parseResult,
    isLoading,
    error,
    setTextInput,
    setParseResult,
    setLoading,
    setError,
    goToInput,
    treatAsFlatList,
    setScreen,
    reset: resetInput,
  } = useInputStore();

  // Defensive: if screen is 'confirming' but parseResult is null, fall back to input
  const screen = (rawScreen === 'confirming' && !parseResult) ? 'input' : rawScreen;

  const mappingState = useMappingStore();
  const llmState = useLLMStore();
  const { upload } = useFileUpload();
  const { itemCount } = useTextDetection(textInput);
  const { loadCandidates, loadPipelineCandidates, loadMandatoryFallback, searchCandidates } = useMapping();

  const [showSettings, setShowSettings] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Full FOLIO branch list for input-page Branch Options panel
  const allFolioBranches = Object.values(BRANCH_COLORS).map((b) => ({
    name: b.name,
    color: b.color,
  }));

  // Warmup FOLIO when on confirmation screen
  useFolioWarmup();

  // Trigger mandatory fallback when a branch is set to mandatory and has no candidates
  const fallbackInFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    const { mappingResponse, currentItemIndex, branchStates } = mappingState;
    if (!mappingResponse || screen !== 'mapping') return;

    const currentItem = mappingResponse.items[currentItemIndex];
    if (!currentItem) return;

    const existingBranchNames = currentItem.branch_groups.map((g) => g.branch);
    const mandatoryMissing = Object.entries(branchStates)
      .filter(([name, state]) => state === 'mandatory' && !existingBranchNames.includes(name))
      .map(([name]) => name);

    // Dedupe: only trigger for branches not already in-flight
    const toFetch = mandatoryMissing.filter(
      (b) => !fallbackInFlight.current.has(`${currentItemIndex}:${b}`),
    );
    if (toFetch.length === 0) return;

    for (const b of toFetch) {
      fallbackInFlight.current.add(`${currentItemIndex}:${b}`);
    }

    // Build LLM config if available
    const activeConfig = llmState.configs[llmState.activeProvider];
    const llmConfig =
      activeConfig?.connectionStatus === 'valid'
        ? {
            provider: llmState.activeProvider,
            api_key: activeConfig.apiKey || null,
            base_url: activeConfig.baseUrl || null,
            model: activeConfig.model || null,
          }
        : null;

    loadMandatoryFallback(
      currentItemIndex,
      currentItem.item_text,
      branchStates,
      existingBranchNames,
      llmConfig,
    ).finally(() => {
      for (const b of toFetch) {
        fallbackInFlight.current.delete(`${currentItemIndex}:${b}`);
      }
    });
  }, [
    mappingState.mappingResponse,
    mappingState.currentItemIndex,
    mappingState.branchStates,
    screen,
    llmState.activeProvider,
    llmState.configs,
    loadMandatoryFallback,
  ]);

  // Keyboard shortcuts active only on mapping screen
  const { showGoToDialog, setShowGoToDialog, handleGoTo, showShortcutsOverlay, setShowShortcutsOverlay } = useKeyboardShortcuts(
    screen === 'mapping',
  );

  // Track whether current pipeline run is LLM-enhanced (for overlay messaging)
  const [isPipelineRun, setIsPipelineRun] = useState(false);

  const handleTextSubmit = async () => {
    setLoading(true);
    try {
      const result = await parseText(textInput);
      setParseResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed');
    }
  };

  const handleContinue = async () => {
    if (!parseResult) return;
    setScreen('mapping');

    // Auto-detect: use LLM pipeline if active provider has a valid connection
    const activeConfig = llmState.configs[llmState.activeProvider];
    if (activeConfig?.connectionStatus === 'valid') {
      setIsPipelineRun(true);
      await loadPipelineCandidates(parseResult.items, {
        provider: llmState.activeProvider,
        api_key: activeConfig.apiKey || null,
        base_url: activeConfig.baseUrl || null,
        model: activeConfig.model || null,
      });
      setIsPipelineRun(false);
    } else {
      await loadCandidates(parseResult.items);
    }
  };

  const handleEditFromMapping = () => {
    setScreen('confirming');
  };

  const handleSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const activeConfig = llmState.configs[llmState.activeProvider];
      const llmConfig =
        activeConfig?.connectionStatus === 'valid'
          ? {
              provider: llmState.activeProvider,
              api_key: activeConfig.apiKey || null,
              base_url: activeConfig.baseUrl || null,
              model: activeConfig.model || null,
            }
          : null;
      await searchCandidates(query, mappingState.currentItemIndex, llmConfig);
    } finally {
      setIsSearching(false);
    }
  };

  const settingsModal = showSettings && (
    <LLMSettings
      activeProvider={llmState.activeProvider}
      configs={llmState.configs}
      onSetActiveProvider={llmState.setActiveProvider}
      onUpdateConfig={llmState.updateConfig}
      onSetConnectionStatus={llmState.setConnectionStatus}
      onClose={() => setShowSettings(false)}
      testConnection={testConnection}
      fetchModels={fetchModels}
    />
  );

  // Mapping screen uses full-width layout (no centering/padding)
  if (screen === 'mapping') {
    return (
      <div className="flex h-screen flex-col">
        <Header
          onOpenSettings={() => setShowSettings(true)}
          onRestart={() => {
            mappingState.resetMapping();
            resetInput();
            setIsPipelineRun(false);
          }}
        />
        {settingsModal}
        {mappingState.mappingResponse ? (
          <MappingScreen
            mappingResponse={mappingState.mappingResponse}
            currentItemIndex={mappingState.currentItemIndex}
            totalItems={mappingState.totalItems}
            selections={mappingState.selections}
            nodeStatuses={mappingState.nodeStatuses}
            threshold={mappingState.threshold}
            branchStates={mappingState.branchStates}
            allBranches={
              mappingState.mappingResponse.branches_available.map((b) => ({
                name: b.name,
                color: b.color,
              }))
            }
            selectedCandidateIri={mappingState.selectedCandidateIri}
            prescanSegments={
              mappingState.pipelineMetadata?.[mappingState.currentItemIndex]?.prescan?.segments
            }
            folioStatus={mappingState.folioStatus}
            isLoadingCandidates={mappingState.isLoadingCandidates}
            showGoToDialog={showGoToDialog}
            showShortcutsOverlay={showShortcutsOverlay}
            notes={mappingState.notes}
            statusFilter={mappingState.statusFilter}
            isPipeline={isPipelineRun}
            pipelineItemCount={parseResult?.items.length ?? 0}
            onPrev={mappingState.prevItem}
            onNext={mappingState.nextItem}
            onSkip={mappingState.skipItem}
            onGoTo={handleGoTo}
            onOpenGoTo={() => setShowGoToDialog(true)}
            onCloseGoTo={() => setShowGoToDialog(false)}
            onCloseShortcuts={() => setShowShortcutsOverlay(false)}
            onAcceptAll={mappingState.acceptAllDefaults}
            onEdit={handleEditFromMapping}
            onToggleCandidate={(iriHash) =>
              mappingState.toggleCandidate(mappingState.currentItemIndex, iriHash)
            }
            onSelectForDetail={mappingState.selectCandidateForDetail}
            onSetBranchState={mappingState.setBranchState}
            onThresholdChange={mappingState.setThreshold}
            branchSortMode={mappingState.branchSortMode}
            customBranchOrder={mappingState.customBranchOrder}
            onSetBranchSortMode={mappingState.setBranchSortMode}
            onSetCustomBranchOrder={mappingState.setCustomBranchOrder}
            onSearch={handleSearch}
            isSearching={isSearching}
            onSetNote={mappingState.setNote}
            onStatusFilterChange={mappingState.setStatusFilter}
            onShowShortcuts={() => setShowShortcutsOverlay(true)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              <p className="text-sm text-gray-500">
                Loading FOLIO ontology and searching for candidates...
              </p>
              {mappingState.error && (
                <p className="mt-2 text-sm text-red-600">{mappingState.error}</p>
              )}
              <button
                onClick={() => {
                  mappingState.resetMapping();
                  resetInput();
                  setIsPipelineRun(false);
                }}
                className="mt-4 rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-300"
              >
                Start Over
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <AppShell onOpenSettings={() => setShowSettings(true)}>
      {settingsModal}

      {screen === 'input' && (
        <InputScreen
          fileDropZone={
            <FileDropZone
              onFile={upload}
              isLoading={isLoading}
              selectedFileName={selectedFile?.name}
            />
          }
          textInput={
            <TextInput
              value={textInput}
              onChange={setTextInput}
              itemCount={itemCount}
              onSubmit={handleTextSubmit}
              disabled={isLoading}
            />
          }
          branchOptions={
            <BranchOptionsPanel
              allBranches={allFolioBranches}
              branchStates={mappingState.inputBranchStates}
              branchSortMode={mappingState.branchSortMode}
              onSetBranchState={mappingState.setInputBranchState}
              onSetBranchSortMode={mappingState.setBranchSortMode}
            />
          }
          error={error}
        />
      )}

      {screen === 'confirming' && parseResult && (
        <ConfirmationScreen
          result={parseResult}
          onEdit={goToInput}
          onContinue={handleContinue}
          onTreatAsFlat={treatAsFlatList}
        />
      )}
    </AppShell>
  );
}
