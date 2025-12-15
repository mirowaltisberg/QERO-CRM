'use client';

import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils/cn';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const sizeMap: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  full: 'max-w-[95vw]',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnOverlay?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
}: ModalProps) {
  const modalRoot = typeof window !== 'undefined' ? document.body : null;
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose]);

  const handleOverlayClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (closeOnOverlay) {
        onClose();
      }
    },
    [closeOnOverlay, onClose]
  );

  if (!open || !modalRoot) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'w-full rounded-2xl border border-gray-200 bg-white shadow-xl transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          sizeMap[size]
        )}
        style={{ transform: 'translateY(0)', animation: 'modalIn 280ms var(--transition-base)' }}
      >
        {(title || description) && (
          <header className="border-b border-gray-100 px-4 py-3">
            {title && (
              <h2 id={titleId} className="text-base font-semibold text-gray-900">
                {title}
              </h2>
            )}
            {description && (
              <p id={descriptionId} className="text-sm text-gray-500">
                {description}
              </p>
            )}
          </header>
        )}

        <div className="px-4 py-4 text-sm text-gray-700 max-h-[60vh] overflow-y-auto">{children}</div>

        {footer && <footer className="border-t border-gray-100 px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    modalRoot
  );
}

