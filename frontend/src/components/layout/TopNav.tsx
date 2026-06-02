'use client';

import { FiMenu, FiBell, FiSearch, FiUser } from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import axios from '@/lib/axios';

export function TopNav({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { user, clearAuth } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await axios.post('/auth/logout');
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      clearAuth();
      router.push('/login');
    }
  };

  return (
    <header className="h-16 bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 sticky top-0 z-30 px-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button 
          onClick={onOpenSidebar}
          className="p-2 text-on-surface-variant hover:bg-surface-variant/50 rounded-lg lg:hidden"
        >
          <FiMenu className="text-xl" />
        </button>
        
        {/* Search - Visible on md and up */}
        <div className="hidden md:flex relative group">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input 
            type="text" 
            placeholder="Search documents, flashcards..." 
            className="pl-10 pr-4 py-2 w-64 bg-surface-container-lowest border border-outline-variant/50 rounded-full text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all group-hover:border-outline-variant"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="p-2 text-on-surface-variant hover:bg-surface-variant/50 hover:text-primary rounded-full transition-colors relative">
          <FiBell className="text-xl" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full ring-2 ring-surface"></span>
        </button>
        
        <div className="h-8 w-px bg-outline-variant/30 mx-2"></div>
        
        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-sm font-bold text-on-surface leading-tight">{user?.username || 'Student'}</span>
            <span className="text-xs text-outline">{user?.role || 'USER'}</span>
          </div>
          <button 
            onClick={handleLogout}
            title="Logout"
            className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary-container to-tertiary-container flex items-center justify-center text-on-primary-container shadow-sm border border-outline-variant/20 hover:shadow-md transition-all"
          >
            <FiUser />
          </button>
        </div>
      </div>
    </header>
  );
}
