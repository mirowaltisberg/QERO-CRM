import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import {
  CONTACT_STATUS_COLORS,
  CONTACT_STATUS_LABELS,
  type ContactStatus,
} from '@/lib/utils/constants';

type TagTone = 'default' | 'muted' | 'outline';

const toneClasses: Record<TagTone, string> = {
  default: 'bg-gray-100 text-gray-700 border-transparent',
  muted: 'bg-white text-gray-500 border-gray-200',
  outline: 'bg-transparent text-gray-600 border-gray-200',
};

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  status?: ContactStatus | null;
  tone?: TagTone;
  icon?: ReactNode;
  fallbackLabel?: string;
}

export function Tag({
  status,
  tone = 'default',
  children,
  className,
  icon,
  fallbackLabel = 'Not set',
  ...props
}: TagProps) {
  const content = status ? CONTACT_STATUS_LABELS[status] : children ?? fallbackLabel;
  const statusClasses = status ? CONTACT_STATUS_COLORS[status] : toneClasses[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide transition-all duration-200',
        statusClasses,
        className
      )}
      {...props}
    >
      {icon && <span className="text-[10px]">{icon}</span>}
      {content}
    </span>
  );
}

