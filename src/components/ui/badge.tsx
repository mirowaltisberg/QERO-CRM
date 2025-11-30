import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

type BadgeTone = 'default' | 'muted' | 'outline';

const toneClasses: Record<BadgeTone, string> = {
  default: 'bg-gray-900 text-white border-transparent',
  muted: 'bg-gray-100 text-gray-600 border-transparent',
  outline: 'bg-transparent text-gray-600 border border-gray-200',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  pill?: boolean;
}

export function Badge({ tone = 'muted', pill = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-[22px] items-center justify-center rounded-md px-2 text-xs font-medium',
        toneClasses[tone],
        pill && 'rounded-full',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

