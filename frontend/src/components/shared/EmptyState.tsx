import React from 'react';
import { IconType } from 'react-icons';

interface EmptyStateProps {
  icon: IconType;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-surface-container-lowest border border-outline-variant/30 rounded-2xl border-dashed">
      <div className="w-16 h-16 bg-surface-container flex items-center justify-center rounded-full mb-4 text-primary">
        <Icon className="text-3xl" />
      </div>
      <h3 className="text-xl font-heading font-bold text-on-surface mb-2">{title}</h3>
      <p className="text-on-surface-variant max-w-sm mb-6">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
