import type { ReactNode } from 'react';
import { Header } from './Header';

interface AppShellProps {
  children: ReactNode;
  onOpenSettings?: () => void;
  llmStatus?: 'connected' | 'disconnected' | 'none';
  llmProviderLabel?: string;
  embeddingStatus?: 'ready' | 'building' | 'unavailable' | 'none';
  embeddingDetail?: string;
  folioUpdateStatus?: 'current' | 'checking' | 'updating' | 'updated' | 'error' | 'none';
  folioUpdateDetail?: string;
}

export function AppShell({ children, onOpenSettings, llmStatus, llmProviderLabel, embeddingStatus, embeddingDetail, folioUpdateStatus, folioUpdateDetail }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header onOpenSettings={onOpenSettings} llmStatus={llmStatus} llmProviderLabel={llmProviderLabel} embeddingStatus={embeddingStatus} embeddingDetail={embeddingDetail} folioUpdateStatus={folioUpdateStatus} folioUpdateDetail={folioUpdateDetail} />
      <main className="flex flex-1 flex-col items-center px-6 py-8">{children}</main>
    </div>
  );
}
