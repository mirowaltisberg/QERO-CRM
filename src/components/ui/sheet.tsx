'use client';

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// Context to share close handler with overlay (needed for non-modal mode)
const SheetCloseContext = React.createContext<(() => void) | null>(null);

// Wrap Root with modal={false} by default so nested portaled modals can receive pointer events
interface SheetProps extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Root> {
  modal?: boolean;
}
const Sheet = ({ modal = false, onOpenChange, ...props }: SheetProps) => {
  const handleClose = React.useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  return (
    <SheetCloseContext.Provider value={handleClose}>
      <SheetPrimitive.Root modal={modal} onOpenChange={onOpenChange} {...props} />
    </SheetCloseContext.Provider>
  );
};
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

interface SheetOverlayProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay> {
  onCloseRequest?: () => void;
}

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  SheetOverlayProps
>(({ className, onCloseRequest, ...props }, ref) => {
  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Only close if clicking the overlay itself, not a nested modal
      if (event.target !== event.currentTarget) return;
      const target = event.target as HTMLElement;
      if (target.closest?.('[data-qero-modal="true"]')) return;
      onCloseRequest?.();
    },
    [onCloseRequest]
  );

  return (
    <SheetPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/30 backdrop-blur-sm',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className
      )}
      onClick={handleClick}
      {...props}
      ref={ref}
    />
  );
});
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showClose?: boolean;
}

const sheetVariants = {
  top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
  bottom: 'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
  left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
  right: 'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-md',
};

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, showClose = true, ...props }, ref) => {
  const closeSheet = React.useContext(SheetCloseContext);

  // Allow pointer events outside so nested (portaled) modals can receive clicks.
  // But keep the sheet open when the outside interaction is within our custom modal.
  const handleOutsideInteraction = React.useCallback((event: any) => {
    const originalTarget =
      event?.originalEvent?.target ??
      event?.detail?.originalEvent?.target ??
      event?.target;
    const targetEl = originalTarget as HTMLElement | null;
    if (targetEl?.closest?.('[data-qero-modal="true"]')) {
      event.preventDefault();
    }
  }, []);

  return (
    <SheetPortal>
      <SheetOverlay onCloseRequest={closeSheet ?? undefined} />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-white/95 backdrop-blur-xl shadow-2xl',
          'transition ease-out duration-300',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:duration-200 data-[state=open]:duration-300',
          sheetVariants[side],
          className
        )}
        onPointerDownOutside={handleOutsideInteraction}
        onInteractOutside={handleOutsideInteraction}
        {...props}
      >
        {children}
        {showClose && (
          <SheetPrimitive.Close
            className={cn(
              'absolute right-4 top-4 rounded-full p-1.5',
              'bg-gray-100/80 hover:bg-gray-200/80 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2',
              'disabled:pointer-events-none'
            )}
          >
            <X className="h-4 w-4 text-gray-600" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col gap-1.5 px-5 pt-5 pb-4 border-b border-gray-100',
      className
    )}
    {...props}
  />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'mt-auto flex flex-col gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/50',
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-base font-semibold text-gray-900', className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-sm text-gray-500', className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};

