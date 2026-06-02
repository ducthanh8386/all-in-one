import React from 'react';
import { clsx } from 'clsx';

interface LoadingSkeletonProps {
  className?: string;
  type?: 'text' | 'card' | 'avatar';
}

export function LoadingSkeleton({ className, type = 'text' }: LoadingSkeletonProps) {
  const baseClass = "animate-pulse bg-surface-variant rounded";
  
  const typeClasses = {
    text: "h-4 w-3/4",
    card: "h-32 w-full rounded-2xl",
    avatar: "h-12 w-12 rounded-full",
  };

  return (
    <div className={clsx(baseClass, typeClasses[type], className)} />
  );
}
