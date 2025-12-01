import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
}

export function Panel({
  title,
  description,
  actions,
  footer,
  bodyClassName,
  className,
  children,
  ...props
}: PanelProps) {
  const hasHeader = Boolean(title || description || actions);
  
  // Check if flex classes are applied to support scrolling
  const isFlexContainer = className?.includes('flex');

  return (
    <section
      className={cn(
        'rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:shadow-lg',
        className
      )}
      {...props}
    >
      {hasHeader && (
        <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3 flex-shrink-0">
          <div>
            {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
            {description && <p className="text-sm text-gray-500">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className={cn(
        'px-4 py-4',
        isFlexContainer && 'flex-1 min-h-0 overflow-hidden flex flex-col',
        bodyClassName
      )}>
        {children}
      </div>

      {footer && (
        <div className="border-t border-gray-100 px-4 py-3 text-sm text-gray-500 flex-shrink-0">{footer}</div>
      )}
    </section>
  );
}
