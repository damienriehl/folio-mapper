import { useState } from 'react';
import { parseText, testConnection, fetchModels } from '@folio-mapper/core';
import {
  AppShell,
  InputScreen,
  TextInput,
  FileDropZone,
  ConfirmationScreen,
  MappingScreen,
  Header,
  LLMSettings,
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
  const { loadCandidates } = useMapping();

  const [showSettings, setShowSettings] = useState(false);

  // Warmup FOLIO when on confirmation screen
  useFolioWarmup();

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
    await loadCandidates(parseResult.items);
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
            enabledBranches={mappingState.enabledBranches}
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
            onToggleBranch={mappingState.toggleBranch}
            onThresholdChange={mappingState.setThreshold}
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
