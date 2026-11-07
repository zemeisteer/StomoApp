import React from 'react';
import Link from 'next/link';
import { ArrowRight, RotateCcw } from 'lucide-react';

/**
 * Public-site building blocks for the calm, minimal design:
 * generous whitespace, hairline dividers, large quiet headings, pill buttons.
 */

export function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

export function Section({ id, children, className = '' }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`py-14 sm:py-20 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

/** Small numbered eyebrow + heading + optional lead and action. */
export function SectionHeading({
  index,
  eyebrow,
  title,
  lead,
  action,
  align = 'split',
}: {
  index?: string;
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  action?: { href: string; label: string };
  align?: 'split' | 'stack';
}) {
  return (
    <div className={`mb-8 sm:mb-10 ${align === 'split' ? 'flex flex-col gap-6 md:flex-row md:items-end md:justify-between' : ''}`}>
      <div className="max-w-2xl">
        <p className="mb-4 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-subtle">
          {index && <span className="tabular-nums text-brand-600">{index}</span>}
          <span className="h-px w-8 bg-line-strong" aria-hidden="true" />
          {eyebrow}
        </p>
        <h2 className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-3xl lg:text-[2.25rem]">{title}</h2>
        {lead && <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-muted">{lead}</p>}
      </div>
      {action && <TextLink href={action.href}>{action.label}</TextLink>}
    </div>
  );
}

export function PrimaryLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-600 px-6 text-[15px] font-medium text-white transition-colors duration-300 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/25 ${className}`}
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-6 text-[15px] font-medium text-ink transition-colors duration-300 hover:border-ink hover:bg-white ${className}`}
    >
      {children}
    </Link>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex shrink-0 items-center gap-2 text-sm font-medium text-ink transition-colors hover:text-brand-700">
      <span className="border-b border-line-strong pb-0.5 transition-colors group-hover:border-brand-600">{children}</span>
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

export function SkeletonCards({ count = 3, className = 'sm:grid-cols-2 lg:grid-cols-3' }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-px overflow-hidden rounded-3xl border border-line bg-line ${className}`} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-4 bg-white p-8">
          <div className="h-3 w-16 animate-pulse rounded bg-canvas" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-canvas" />
          <div className="h-3 w-full animate-pulse rounded bg-canvas" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-canvas" />
        </div>
      ))}
    </div>
  );
}

export function SectionError({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-3xl border border-line bg-white p-8 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink-muted">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 text-sm font-medium text-ink hover:text-brand-700">
          <RotateCcw className="h-4 w-4" /> {retryLabel}
        </button>
      )}
    </div>
  );
}

/** Top of an inner page: eyebrow, large heading, lead; optional right-side slot (e.g. search). */
export function PageIntro({
  eyebrow,
  title,
  lead,
  aside,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line pb-8 pt-10 sm:pb-10 sm:pt-12">
      <Container>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-5 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-subtle">
              <span className="h-px w-8 bg-line-strong" aria-hidden="true" />
              {eyebrow}
            </p>
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.75rem]">{title}</h1>
            {lead && <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">{lead}</p>}
          </div>
          {aside && <div className="w-full lg:w-80">{aside}</div>}
        </div>
      </Container>
    </header>
  );
}

/** Horizontal, scrollable filter chips with one active value. */
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0" role="tablist" aria-label={label}>
      <div className="flex w-max gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={value === o.value}
            onClick={() => onChange(o.value)}
            className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors duration-300 ${
              value === o.value ? 'bg-ink text-white' : 'border border-line text-ink-muted hover:border-line-strong hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Quiet search field for list pages. */
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-full border border-line bg-white pl-11 pr-4 text-sm text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none"
      />
    </label>
  );
}

export const formatSom = (tiyin: number | null | undefined) =>
  Math.round((tiyin || 0) / 100)
    .toLocaleString('ru-RU')
    .replace(/ /g, ' ');
