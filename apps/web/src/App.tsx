import { useState, useEffect, useRef, useCallback } from 'react';
import { parseText, testConnection, fetchModels, fetchKnownModels, BRANCH_COLORS, PROVIDER_META } from '@folio-mapper/core';
import type { SuggestionEntry, InputHierarchyNode, HierarchyNode } from '@folio-mapper/core';
import {
  AppShell,
  InputScreen,
  TextInput,
  FileDropZone,
  ConfirmationScreen,
  MappingScreen,
  MappingsView,
  Header,
  LLMSettings,
  ModelChooser,
  BranchOptionsPanel,
  SessionRecoveryModal,
  NewProjectModal,
  ExportModal,
  ExportView,
  SuggestionEditModal,
  SubmissionModal,
} from '@folio-mapper/ui';
import { useInputStore } from './store/input-store';
import { useMappingStore } from './store/mapping-store';
import { useLLMStore } from './store/llm-store';
import { useFileUpload } from './hooks/useFileUpload';
import { useTextDetection } from './hooks/useTextDetection';
import { useFolioWarmup } from './hooks/useFolioWarmup';
import { useMapping } from './hooks/useMapping';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSession } from './hooks/useSession';
import { useExport } from './hooks/useExport';
import { useSuggestionSubmit } from './hooks/useSuggestionSubmit';
import { useLlamafile } from './hooks/useLlamafile';

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
  const { itemCount, isTabular } = useTextDetection(textInput);
  const { loadCandidates, loadPipelineCandidates, loadMandatoryFallback, searchCandidates, cancelBatchLoading } = useMapping();

  // Hydrate known models on startup
  useEffect(() => {
    fetchKnownModels()
      .then((models) => llmState.setAllModels(models))
      .catch(() => {}); // graceful — store may already have persisted models
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showSettings, setShowSettings] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Derive simplified LLM status for header badge
  const activeConfig = llmState.configs[llmState.activeProvider];
  const llmStatus = (() => {
    if (!activeConfig || activeConfig.connectionStatus === 'untested') return 'none' as const;
    return activeConfig.connectionStatus === 'valid' ? 'connected' as const : 'disconnected' as const;
  })();
  const llmProviderLabel = PROVIDER_META[llmState.activeProvider]?.displayName ?? '';

  // Toast banner on valid → invalid transition
  const [showDisconnectToast, setShowDisconnectToast] = useState(false);
  const prevConnectionStatus = useRef(activeConfig?.connectionStatus);
  useEffect(() => {
    const current = activeConfig?.connectionStatus;
    if (prevConnectionStatus.current === 'valid' && current === 'invalid') {
      setShowDisconnectToast(true);
      const timer = setTimeout(() => setShowDisconnectToast(false), 6000);
      return () => clearTimeout(timer);
    }
    prevConnectionStatus.current = current;
  }, [activeConfig?.connectionStatus]);

  // Session persistence
  const session = useSession();

  // Export
  const exportState = useExport();

  // Llamafile auto-management (desktop only)
  const llamafile = useLlamafile();
  const llamafileStatus = llamafile.status;

  // Suggestion queue + submission
  const suggestionSubmit = useSuggestionSubmit();
  const [editingSuggestion, setEditingSuggestion] = useState<SuggestionEntry | null>(null);

  // Mappings view
  const [showMappingsView, setShowMappingsView] = useState(false);

  // Build input hierarchy for MappingsView
  const inputHierarchy: InputHierarchyNode[] | null = (() => {
    if (!parseResult) return null;
    const { hierarchy, items } = parseResult;
    if (hierarchy) {
      const itemMap = new Map<string, number>();
      for (const item of items) {
        itemMap.set(item.text, item.index);
      }
      function convert(node: HierarchyNode): InputHierarchyNode {
        return {
          label: node.label,
          depth: node.depth,
          item_index: itemMap.get(node.label) ?? null,
          children: node.children.map(convert),
        };
      }
      return hierarchy.map(convert);
    }
    return items.map((item) => ({
      label: item.text,
      depth: 0,
      item_index: item.index,
      children: [],
    }));
  })();

  const handleSuggestToFolio = useCallback(() => {
    const { mappingResponse, currentItemIndex, notes } = mappingState;
    if (!mappingResponse) return;
    const item = mappingResponse.items[currentItemIndex];
    if (!item) return;

    // Gather top 5 candidates across all branches
    const allCandidates = item.branch_groups.flatMap((g) =>
      g.candidates.map((c) => ({
        iri_hash: c.iri_hash,
        label: c.label,
        iri: c.iri,
        branch: g.branch,
        score: c.score,
      })),
    );
    allCandidates.sort((a, b) => b.score - a.score);
    const top5 = allCandidates.slice(0, 5);

    // Build ancestry context
    const ancestry = parseResult?.items.find((p) => p.index === item.item_index)?.ancestry ?? [];
    const fullContext = ancestry.length > 0
      ? [...ancestry, item.item_text].join(' > ')
      : item.item_text;

    const topCandidate = top5[0];

    const entry: SuggestionEntry = {
      id: crypto.randomUUID(),
      item_index: currentItemIndex,
      original_input: item.item_text,
      full_input_context: fullContext,
      suggested_label: item.item_text,
      suggested_definition: '',
      suggested_synonyms: [],
      suggested_example: '',
      suggested_parent_class: topCandidate
        ? topCandidate.label
        : '',
      suggested_branch: topCandidate?.branch ?? '',
      nearest_candidates: top5,
      user_note: notes[currentItemIndex] || '',
      flagged_at: new Date().toISOString(),
    };

    mappingState.addSuggestion(entry);
  }, [mappingState, parseResult]);

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
    () => exportState.setShowExportModal(true),
    handleSuggestToFolio,
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
      try {
        await loadPipelineCandidates(parseResult.items, {
          provider: llmState.activeProvider,
          api_key: activeConfig.apiKey || null,
          base_url: activeConfig.baseUrl || null,
          model: activeConfig.model || null,
        });
      } catch (err) {
        console.error('Pipeline failed:', err);
      }
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

  // Session file load handler for input screen
  const handleSessionFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      session.handleLoadSessionFile(file);
    }
    // Reset input so re-selecting same file triggers change
    e.target.value = '';
  };

  const settingsModal = showSettings && (
    <LLMSettings
      activeProvider={llmState.activeProvider}
      configs={llmState.configs}
      modelsByProvider={llmState.modelsByProvider}
      llamafileStatus={llamafileStatus}
      llamafileModels={llamafile.models}
      onDownloadModel={llamafile.downloadModel}
      onDeleteModel={llamafile.deleteModel}
      onSetActiveModel={llamafile.setActiveModel}
      onSetActiveProvider={llmState.setActiveProvider}
      onUpdateConfig={llmState.updateConfig}
      onSetConnectionStatus={llmState.setConnectionStatus}
      onModelsLoaded={llmState.setModelsForProvider}
      onClose={() => setShowSettings(false)}
      testConnection={testConnection}
      fetchModels={fetchModels}
    />
  );

  // Recovery modal data
  const recoveryData = session.showRecoveryModal ? session.getRecoveryData() : null;

  // Mapping screen uses full-width layout (no centering/padding)
  if (screen === 'mapping') {
    return (
      <div className="flex h-screen flex-col">
        <Header
          onOpenSettings={() => setShowSettings(true)}
          onRestart={() => {
            cancelBatchLoading();
            mappingState.resetMapping();
            resetInput();
            setIsPipelineRun(false);
          }}
          onSaveSession={session.downloadSession}
          onOpenExport={() => exportState.setShowExportModal(true)}
          onNewProject={session.handleNewProject}
          hasActiveSession={session.hasActiveSession}
          llmStatus={llmStatus}
          llmProviderLabel={llmProviderLabel}
        />
        {showDisconnectToast && (
          <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-800 border-b border-amber-200">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            LLM connection lost — falling back to local search
            <button
              onClick={() => setShowDisconnectToast(false)}
              className="ml-2 text-amber-600 hover:text-amber-800"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        {settingsModal}
        {session.showNewProjectModal && (
          <NewProjectModal
            onSaveAndNew={session.handleSaveAndNew}
            onDiscardAndNew={session.handleDiscardAndNew}
            onCancel={session.handleCancelNewProject}
          />
        )}
        {showMappingsView && mappingState.mappingResponse && (
          <MappingsView
            inputHierarchy={inputHierarchy}
            mappingResponse={mappingState.mappingResponse}
            selections={mappingState.selections}
            branchStates={mappingState.branchStates}
            onClose={() => setShowMappingsView(false)}
          />
        )}
        {exportState.showExportModal && (
          <ExportView
            totalItems={mappingState.totalItems}
            completedCount={Object.values(mappingState.nodeStatuses).filter((s) => s === 'completed').length}
            onExport={exportState.handleExport}
            onFetchTreeData={exportState.handleFetchTreeData}
            onClose={() => exportState.setShowExportModal(false)}
            isExporting={exportState.isExporting}
            branchSortMode={mappingState.branchSortMode}
            customBranchOrder={mappingState.customBranchOrder}
          />
        )}
        {editingSuggestion && (
          <SuggestionEditModal
            entry={editingSuggestion}
            onSave={(id, updates) => {
              mappingState.updateSuggestion(id, updates);
              setEditingSuggestion(null);
            }}
            onClose={() => setEditingSuggestion(null)}
          />
        )}
        {suggestionSubmit.showSubmissionModal && mappingState.suggestionQueue.length > 0 && (() => {
          const content = suggestionSubmit.getIssueContent();
          return (
            <SubmissionModal
              issueTitle={content.title}
              issueBody={content.body}
              onCopyAndOpen={suggestionSubmit.handleCopyAndOpen}
              onSubmitWithToken={suggestionSubmit.handleSubmitWithToken}
              submissionResult={suggestionSubmit.submissionResult}
              submissionError={suggestionSubmit.submissionError}
              isSubmitting={suggestionSubmit.isSubmitting}
              onClose={() => suggestionSubmit.setShowSubmissionModal(false)}
            />
          );
        })()}
        {mappingState.mappingResponse ? (
          <MappingScreen
            mappingResponse={mappingState.mappingResponse}
            currentItemIndex={mappingState.currentItemIndex}
            totalItems={mappingState.totalItems}
            selections={mappingState.selections}
            nodeStatuses={mappingState.nodeStatuses}
            topN={mappingState.topN ?? 5}
            defaultTopN={mappingState.defaultTopN ?? 5}
            branchStates={mappingState.branchStates}
            allBranches={
              mappingState.mappingResponse.branches_available.map((b) => ({
                name: b.name,
                color: b.color,
              }))
            }
            selectedCandidateIri={mappingState.selectedCandidateIri}
            prescanSegments={null}
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
            onTopNChange={(n: number) => mappingState.setTopN(n)}
            onDefaultTopNChange={(n: number) => mappingState.setDefaultTopN(n)}
            branchSortMode={mappingState.branchSortMode}
            customBranchOrder={mappingState.customBranchOrder}
            onSetBranchSortMode={mappingState.setBranchSortMode}
            onSetCustomBranchOrder={mappingState.setCustomBranchOrder}
            onSearch={handleSearch}
            isSearching={isSearching}
            onSetNote={mappingState.setNote}
            onStatusFilterChange={mappingState.setStatusFilter}
            onShowShortcuts={() => setShowShortcutsOverlay(true)}
            onExport={() => exportState.setShowExportModal(true)}
            onMappings={() => setShowMappingsView(true)}
            suggestionQueue={mappingState.suggestionQueue}
            onSuggestToFolio={handleSuggestToFolio}
            onRemoveSuggestion={mappingState.removeSuggestion}
            onEditSuggestion={(entry) => setEditingSuggestion(entry)}
            searchFilterHashes={mappingState.searchFilterHashes}
            onClearSearchFilter={mappingState.clearSearchFilter}
            loadedItemCount={mappingState.loadedItemCount}
            isBatchLoading={mappingState.isBatchLoading}
            batchLoadingError={mappingState.batchLoadingError}
            onOpenSubmission={() => {
              suggestionSubmit.resetSubmission();
              suggestionSubmit.setShowSubmissionModal(true);
            }}
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
                  cancelBatchLoading();
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

      {recoveryData && (
        <SessionRecoveryModal
          created={recoveryData.created}
          totalNodes={recoveryData.totalNodes}
          completedCount={recoveryData.completedCount}
          skippedCount={recoveryData.skippedCount}
          onResume={session.handleResume}
          onStartFresh={session.handleStartFresh}
          onDownload={session.handleDownloadSession}
        />
      )}

      {session.showNewProjectModal && (
        <NewProjectModal
          onSaveAndNew={session.handleSaveAndNew}
          onDiscardAndNew={session.handleDiscardAndNew}
          onCancel={session.handleCancelNewProject}
        />
      )}

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
              isTabular={isTabular}
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
          modelChooser={
            <ModelChooser
              activeProvider={llmState.activeProvider}
              configs={llmState.configs}
              modelsByProvider={llmState.modelsByProvider}
              llamafileStatus={llamafileStatus}
              llamafileModels={llamafile.models}
              onDownloadModel={llamafile.downloadModel}
              onDeleteModel={llamafile.deleteModel}
              onSetActiveModel={llamafile.setActiveModel}
              onSetActiveProvider={llmState.setActiveProvider}
              onUpdateConfig={llmState.updateConfig}
              onSetConnectionStatus={llmState.setConnectionStatus}
              onModelsLoaded={llmState.setModelsForProvider}
              testConnection={testConnection}
              fetchModels={fetchModels}
            />
          }
          sessionFileInput={
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Resume Session
              <input
                type="file"
                accept=".json"
                onChange={handleSessionFileSelect}
                className="hidden"
              />
            </label>
          }
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
