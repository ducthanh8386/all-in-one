import React from 'react';
import { clsx } from 'clsx';

export type DocStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface StatusBadgeProps {
  status: DocStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusStyles: Record<DocStatus, string> = {
    PENDING: "bg-surface-variant text-on-surface-variant border-outline-variant",
    PROCESSING: "bg-secondary-container text-on-secondary-container border-secondary-container/50 animate-pulse",
    COMPLETED: "bg-success/20 text-success border-success/30",
    FAILED: "bg-error-container text-on-error-container border-error-container/50",
  };

  const statusText: Record<DocStatus, string> = {
    PENDING: "Pending",
    PROCESSING: "Processing",
    COMPLETED: "Completed",
    FAILED: "Failed",
  };

  return (
    <span className={clsx(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
      statusStyles[status]
    )}>
      {statusText[status]}
    </span>
  );
}
