import type { ReactNode } from 'react';
import { Header } from './Header';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col items-center px-6 py-8">{children}</main>
    </div>
  );
}
