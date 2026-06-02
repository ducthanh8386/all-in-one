import React from 'react';
import { FiZap } from 'react-icons/fi';
import { clsx } from 'clsx';

export function AIComingSoonBadge({ className }: { className?: string }) {
  return (
    <div className={clsx(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-primary-container/20 to-tertiary-container/20 border border-primary-container/30 text-xs font-bold text-primary",
      className
    )}>
      <FiZap className="text-primary" />
      <span>AI is developing</span>
    </div>
  );
}
