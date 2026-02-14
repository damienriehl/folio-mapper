import { parseText } from '@folio-mapper/core';
import {
  AppShell,
  InputScreen,
  TextInput,
  FileDropZone,
  ConfirmationScreen,
} from '@folio-mapper/ui';
import { useInputStore } from './store/input-store';
import { useFileUpload } from './hooks/useFileUpload';
import { useTextDetection } from './hooks/useTextDetection';

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
  } = useInputStore();

  const { upload } = useFileUpload();
  const { itemCount } = useTextDetection(textInput);

  const handleTextSubmit = async () => {
    setLoading(true);
    try {
      const result = await parseText(textInput);
      setParseResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed');
    }
  };

  return (
    <AppShell>
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
          onContinue={() => {
            // Stage 2+ will handle this
          }}
          onTreatAsFlat={treatAsFlatList}
        />
      )}
    </AppShell>
  );
}
