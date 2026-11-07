'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Clock, ChevronDown } from 'lucide-react';

type Props = {
  value: string; // 'HH:mm' or ''
  onChange: (value: string) => void;
  step?: number; // minutes
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
};

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toStr = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Time picker in the panel's style: a button that opens a grid of times (15-minute steps by default).
 * Keyboard: arrows move, Enter picks, Escape closes. A visually hidden input keeps native `required`.
 */
export function TimeSelect({
  value,
  onChange,
  step = 15,
  min = '06:00',
  max = '23:00',
  required,
  disabled,
  placeholder = '--:--',
  className = '',
  'aria-label': ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const options = useMemo(() => {
    const out: string[] = [];
    for (let m = toMin(min); m <= toMin(max); m += step) out.push(toStr(m));
    // Keep an off-grid saved value selectable (e.g. 09:10 from older data)
    if (value && !out.includes(value)) out.push(value), out.sort();
    return out;
  }, [min, max, step, value]);

  useEffect(() => {
    if (!open) return;
    const i = Math.max(0, options.indexOf(value));
    setActive(i);
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: 'center' });
    });
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, options, value]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    const cols = 4;
    const move = (d: number) => {
      e.preventDefault();
      const next = Math.min(options.length - 1, Math.max(0, active + d));
      setActive(next);
      listRef.current?.querySelector<HTMLElement>(`[data-i="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    };
    if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowLeft') move(-1);
    else if (e.key === 'ArrowDown') move(cols);
    else if (e.key === 'ArrowUp') move(-cols);
    else if (e.key === 'Enter') {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        className="flex h-10 w-full items-center gap-2 rounded-xl border border-line bg-white px-3 text-left text-sm text-ink transition-colors hover:border-line-strong focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-subtle"
      >
        <Clock className="h-4 w-4 shrink-0 text-ink-subtle" />
        <span className={`flex-1 tabular-nums ${value ? '' : 'text-ink-subtle'}`}>{value || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <input
        tabIndex={-1}
        aria-hidden="true"
        required={required}
        value={value}
        onChange={() => {}}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 z-50 mt-1.5 grid max-h-60 w-full min-w-[220px] grid-cols-4 gap-1 overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-popover animate-fade-in"
        >
          {options.map((t, i) => {
            const selected = t === value;
            return (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={selected}
                data-i={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(t)}
                className={`h-8 rounded-lg text-xs font-medium tabular-nums transition-colors ${
                  selected
                    ? 'bg-brand-600 text-white'
                    : i === active
                      ? 'bg-brand-50 text-brand-800'
                      : t.endsWith(':00')
                        ? 'text-ink hover:bg-canvas'
                        : 'text-ink-muted hover:bg-canvas'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
