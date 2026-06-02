import React from 'react';
import { clsx } from 'clsx';

interface SectionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  highlight?: boolean;
}

export function SectionCard({ children, highlight, className, ...props }: SectionCardProps) {
  return (
    <div 
      className={clsx(
        "bg-surface-container-lowest border border-outline-variant/30 shadow-sm transition-all",
        highlight ? "rounded-[24px] shadow-primary/5" : "rounded-2xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
