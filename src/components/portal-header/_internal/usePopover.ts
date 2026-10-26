import { useEffect, useRef } from 'react';

/**
 * Closes a header popover on a click outside its anchor or on Escape, and
 * returns focus to the trigger on Escape.
 */
export function usePopoverDismiss<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const anchorRef = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
      anchorRef.current?.querySelector<HTMLElement>('button')?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return anchorRef;
}
