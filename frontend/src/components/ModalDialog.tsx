'use client';

import React, { useEffect, useRef, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  className?: string;
}

/**
 * Open dialogs, oldest first. Only the newest one reacts to Escape and Tab, so a dialog opened
 * from inside another (e.g. payment from the visit card) is the one the keyboard talks to.
 */
const openStack: string[] = [];
let scrollLocks = 0;
let savedOverflow = '';

export const ModalDialog: React.FC<ModalDialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnBackdropClick = true,
  initialFocusRef,
  className = '',
}) => {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descId = `${generatedId}-desc`;

  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  // Parents often pass a new onClose on every render; reading it from a ref keeps the effect
  // (and this dialog's place in the stack) stable while the dialog stays open
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => setMounted(true), []);

  // Focus management: capture previous focus, set initial focus, and trap focus
  useEffect(() => {
    if (!isOpen) return;

    // Save active element to restore later
    if (typeof document !== 'undefined') {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
    }

    openStack.push(generatedId);
    const isTop = () => openStack[openStack.length - 1] === generatedId;

    // Block background scrolling (counted, so closing an inner dialog keeps the outer one locked)
    if (scrollLocks++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    // Set initial focus
    const focusTimer = setTimeout(() => {
      if (initialFocusRef && initialFocusRef.current) {
        initialFocusRef.current.focus();
      } else if (dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length > 0) {
          focusableElements[0].focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 50);

    // Escape key listener & Focus Trap
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        // If focus or event target is inside a portaled popover or custom select, bypass dialog focus clamp
        const activeEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
        const targetEl = e.target as HTMLElement | null;
        const isInsidePortaled =
          (activeEl && (activeEl.closest('[data-custom-select-popover]') || activeEl.closest('[role="listbox"]') || activeEl.closest('[data-portal]'))) ||
          (targetEl && (targetEl.closest('[data-custom-select-popover]') || targetEl.closest('[role="listbox"]') || targetEl.closest('[data-portal]')));

        if (isInsidePortaled) {
          return;
        }

        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null); // only visible elements

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      const idx = openStack.lastIndexOf(generatedId);
      if (idx !== -1) openStack.splice(idx, 1);
      if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
      document.removeEventListener('keydown', handleKeyDown);

      // Restore focus to previously focused element
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === 'function') {
        previouslyFocusedElementRef.current.focus();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, generatedId]);

  if (!isOpen || !mounted) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  }[size];

  // Rendered at the end of <body>: a dialog opened later always sits above the earlier ones
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative w-full ${sizeClasses} bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-line max-h-[90vh] overflow-y-auto outline-none ${className}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4 mb-4">
          <div>
            <h2 id={titleId} className="text-lg font-extrabold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-xs text-ink-muted mt-0.5">
                {description}
              </p>
            )}
          </div>

          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Yopish"
              className="p-1.5 text-ink-subtle hover:text-ink-muted rounded-xl hover:bg-canvas transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        {children}
      </div>
    </div>,
    document.body,
  );
};
