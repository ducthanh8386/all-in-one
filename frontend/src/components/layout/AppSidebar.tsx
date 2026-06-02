'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  FiHome, 
  FiFolder, 
  FiLayers, 
  FiTarget, 
  FiCalendar, 
  FiShield,
  FiZap,
  FiBookOpen,
  FiUploadCloud,
  FiAlertTriangle,
  FiClock,
  FiFileText
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

export function AppSidebar({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: FiHome },
    { name: 'My Subjects', href: '/subjects', icon: FiBookOpen },
    { name: 'Import Bank', href: '/imports', icon: FiUploadCloud },
    { name: 'Mistakes', href: '/mistakes', icon: FiAlertTriangle },
    { name: 'Study Planner', href: '/study-planner', icon: FiClock },
    { name: 'Exam Papers', href: '/exam-papers', icon: FiFileText },
    { name: 'Workspace', href: '/workspace', icon: FiFolder },
    { name: 'Flashcards', href: '/flashcards', icon: FiLayers },
    { name: 'Quiz Practice', href: '/quiz', icon: FiTarget },
    { name: 'Schedule', href: '/schedule', icon: FiCalendar },
    { name: 'Arena', href: '/arena', icon: FiZap },
  ];

  if (user?.role === 'ADMIN') {
    navItems.push({ name: 'Admin', href: '/admin', icon: FiShield });
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Content */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-surface/80 backdrop-blur-xl border-r border-outline-variant/30 flex flex-col
        transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:h-screen lg:w-64 lg:flex-shrink-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Header */}
        <div className="h-16 flex flex-col justify-center px-6 border-b border-outline-variant/30">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-tertiary flex items-center justify-center text-on-primary font-bold shadow-lg shadow-primary/20">
              BS
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-heading font-bold text-lg text-on-surface">Brain-Sync</span>
              <span className="text-[10px] uppercase tracking-wider text-outline font-semibold">The Intellectual Engine</span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium text-sm
                  ${isActive 
                    ? 'bg-primary text-on-primary shadow-md shadow-primary/20' 
                    : 'text-on-surface-variant hover:bg-surface-variant/50 hover:text-primary'}
                `}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose();
                }}
              >
                <item.icon className={`text-lg ${isActive ? 'text-on-primary' : 'text-outline group-hover:text-primary'}`} />
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-outline-variant/30">
          <div className="bg-gradient-to-r from-primary-container/20 to-tertiary-container/20 rounded-xl p-4 border border-primary-container/30">
            <h4 className="font-heading font-bold text-sm text-on-surface mb-1">AI Status</h4>
            <p className="text-xs text-on-surface-variant mb-3">Syncing neural paths...</p>
            <div className="inline-flex px-2.5 py-1 rounded-full bg-surface-variant text-[10px] font-bold text-primary">
              BETA
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
