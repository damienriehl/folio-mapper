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
  BranchOptionsModal,
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
    screen,
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
  } = useInputStore();

  const mappingState = useMappingStore();
  const llmState = useLLMStore();
  const { upload } = useFileUpload();
  const { itemCount } = useTextDetection(textInput);
  const { loadCandidates, loadPipelineCandidates, loadMandatoryFallback } = useMapping();

  const [showSettings, setShowSettings] = useState(false);
  const [showInputBranchOptions, setShowInputBranchOptions] = useState(false);

  // Full FOLIO branch list for input-page Branch Options modal
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
  const { showGoToDialog, setShowGoToDialog, handleGoTo } = useKeyboardShortcuts(
    screen === 'mapping',
  );

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
      await loadPipelineCandidates(parseResult.items, {
        provider: llmState.activeProvider,
        api_key: activeConfig.apiKey || null,
        base_url: activeConfig.baseUrl || null,
        model: activeConfig.model || null,
      });
    } else {
      await loadCandidates(parseResult.items);
    }
  };

  const handleEditFromMapping = () => {
    setScreen('confirming');
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
        <Header onOpenSettings={() => setShowSettings(true)} />
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
            folioStatus={mappingState.folioStatus}
            isLoadingCandidates={mappingState.isLoadingCandidates}
            showGoToDialog={showGoToDialog}
            onPrev={mappingState.prevItem}
            onNext={mappingState.nextItem}
            onSkip={mappingState.skipItem}
            onGoTo={handleGoTo}
            onOpenGoTo={() => setShowGoToDialog(true)}
            onCloseGoTo={() => setShowGoToDialog(false)}
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
        <>
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
              <button
                type="button"
                onClick={() => setShowInputBranchOptions(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Branch Options
              </button>
            }
            error={error}
          />
          {showInputBranchOptions && (
            <BranchOptionsModal
              allBranches={allFolioBranches}
              branchStates={mappingState.inputBranchStates}
              branchSortMode={mappingState.branchSortMode}
              customBranchOrder={mappingState.customBranchOrder}
              onSetBranchState={mappingState.setInputBranchState}
              onSetBranchSortMode={mappingState.setBranchSortMode}
              onSetCustomBranchOrder={mappingState.setCustomBranchOrder}
              onClose={() => setShowInputBranchOptions(false)}
              allowExclude={false}
            />
          )}
        </>
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
