import React from 'react';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

interface GradientButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export function GradientButton({
  children,
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  ...props
}: GradientButtonProps) {
  const baseStyles = "inline-flex items-center justify-center font-bold rounded-full transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none";
  
  const sizeStyles = {
    sm: "px-4 py-1.5 text-xs",
    md: "px-6 py-2.5 text-sm",
    lg: "px-8 py-3.5 text-base"
  };

  const variantStyles = {
    primary: "bg-gradient-to-br from-primary to-tertiary text-on-primary shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5",
    secondary: "bg-surface-container border border-outline-variant/30 text-on-surface hover:bg-surface-container-high hover:border-outline-variant",
    danger: "bg-gradient-to-br from-error to-[#dc2626] text-on-error shadow-lg shadow-error/25 hover:shadow-error/40 hover:-translate-y-0.5"
  };

  return (
    <button
      className={cn(
        baseStyles,
        sizeStyles[size],
        variantStyles[variant],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
