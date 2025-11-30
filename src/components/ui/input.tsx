'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  hint?: string;
  error?: string;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, leftAddon, rightAddon, className, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const descriptionId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <label className="flex w-full flex-col gap-1 text-sm text-gray-700" htmlFor={inputId}>
        {label && <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>}

        <div
          className={cn(
            'flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900/10',
            error && 'border-red-300 focus-within:ring-red-200',
            className
          )}
        >
          {leftAddon && <span className="text-gray-400">{leftAddon}</span>}

          <input
            id={inputId}
            ref={ref}
            className="flex-1 border-none bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none"
            aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
            aria-invalid={Boolean(error)}
            {...props}
          />

          {rightAddon && <span className="text-gray-400">{rightAddon}</span>}
        </div>

        {(hint || error) && (
          <span
            id={error ? errorId : descriptionId}
            className={cn('text-xs text-gray-400', error && 'text-red-500')}
          >
            {error ?? hint}
          </span>
        )}
      </label>
    );
  }
);

Input.displayName = 'Input';
