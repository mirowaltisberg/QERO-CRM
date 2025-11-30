'use client';

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils/cn';

type AutoSaveHandler = (value: string) => void | Promise<void>;

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  autosaveDelay?: number;
  onAutoSave?: AutoSaveHandler;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      hint,
      error,
      className,
      id,
      autosaveDelay = 800,
      onAutoSave,
      value,
      defaultValue,
      onChange,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    const descriptionId = hint ? `${textareaId}-hint` : undefined;
    const errorId = error ? `${textareaId}-error` : undefined;
    const isControlled = value !== undefined && value !== null;
    const [internalValue, setInternalValue] = useState<string>(String(defaultValue ?? ''));
    const currentValue = isControlled ? String(value ?? '') : internalValue;
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!isControlled) {
        setInternalValue(event.target.value);
      }

      onChange?.(event);
    };

    useEffect(() => {
      if (!onAutoSave) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        setStatus('saving');
        Promise.resolve(onAutoSave(currentValue))
          .then(() => {
            setStatus('saved');
            if (statusTimeoutRef.current) {
              clearTimeout(statusTimeoutRef.current);
            }
            statusTimeoutRef.current = setTimeout(() => setStatus('idle'), 2000);
          })
          .catch(() => {
            setStatus('idle');
          });
      }, autosaveDelay);

      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
      };
    }, [currentValue, autosaveDelay, onAutoSave]);

    useEffect(
      () => () => {
        if (statusTimeoutRef.current) {
          clearTimeout(statusTimeoutRef.current);
        }
      },
      []
    );

    return (
      <label className="flex w-full flex-col gap-1 text-sm text-gray-700" htmlFor={textareaId}>
        {label && <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>}

        <textarea
          id={textareaId}
          ref={ref}
          className={cn(
            'min-h-[120px] w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-all duration-200 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10',
            error && 'border-red-300 focus:border-red-400 focus:ring-red-200',
            className
          )}
          aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={Boolean(error)}
          value={currentValue}
          onChange={handleChange}
          {...props}
        />

        <div className="flex items-center justify-between text-xs">
          {(hint || error) && (
            <span id={error ? errorId : descriptionId} className={cn('text-gray-400', error && 'text-red-500')}>
              {error ?? hint}
            </span>
          )}

          {onAutoSave && (
            <span className="text-gray-400">
              {status === 'saving' && 'Saving…'}
              {status === 'saved' && 'Saved'}
              {status === 'idle' && ''}
            </span>
          )}
        </div>
      </label>
    );
  }
);

Textarea.displayName = 'Textarea';

