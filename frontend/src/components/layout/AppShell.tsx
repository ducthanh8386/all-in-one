'use client';

import { useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { TopNav } from './TopNav';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <TopNav onOpenSidebar={() => setIsSidebarOpen(true)} />
        
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8">
          <div className="max-w-[1280px] mx-auto w-full h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
