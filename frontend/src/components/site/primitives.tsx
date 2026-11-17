import React from 'react';
import Link from 'next/link';
import { ArrowRight, RotateCcw } from 'lucide-react';

/**
 * Public-site building blocks for the calm, minimal design:
 * generous whitespace, hairline dividers, large quiet headings, pill buttons.
 */

/** The dealt "arc" mark beside the clinic name, used until the clinic uploads its own logo. */
export function ArcMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-[10px] bg-brand-600 text-white ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M4 16a8 8 0 0 1 16 0" />
        <circle cx="12" cy="16" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1344px] px-5 sm:px-8 ${className}`}>{children}</div>;
}

export function Section({ id, children, className = '' }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`screen py-20 sm:py-28 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

/** Eyebrow + large quiet heading + optional lead and one text action. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  action,
  align = 'split',
}: {
  /** kept for older call sites; numbers are no longer shown */
  index?: string;
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  action?: { href: string; label: string };
  align?: 'split' | 'stack';
}) {
  return (
    <div className={`mb-10 sm:mb-14 ${align === 'split' ? 'flex flex-col gap-6 md:flex-row md:items-end md:justify-between' : ''}`}>
      <div className="max-w-2xl">
        <p className="mb-4 text-sm font-medium text-brand-700">{eyebrow}</p>
        <h2 className="text-3xl font-normal leading-[1.08] tracking-[-0.03em] text-ink sm:text-[2.75rem]">{title}</h2>
        {lead && <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">{lead}</p>}
      </div>
      {action && <TextLink href={action.href}>{action.label}</TextLink>}
    </div>
  );
}

/** The one button family (dealt "arrow"): solid brand fill, a small arrow that moves on hover. */
export function PrimaryLink({
  href,
  children,
  className = '',
  arrow = true,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  arrow?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`btn-step inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-brand-600 pl-6 ${arrow ? 'pr-5' : 'pr-6'} text-[15px] font-medium text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/25 ${className}`}
    >
      {children}
      {arrow && <ArrowRight className="btn-arrow h-4 w-4" aria-hidden="true" />}
    </Link>
  );
}

export function SecondaryLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`btn-step inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line-strong bg-white/60 px-6 text-[15px] font-medium text-ink hover:border-ink ${className}`}
    >
      {children}
    </Link>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex min-h-[44px] shrink-0 items-center gap-2 text-[15px] font-medium text-ink transition-colors hover:text-brand-700">
      <span className="link-draw pb-0.5">{children}</span>
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
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
    <header className="hero-enter border-b border-line pb-10 pt-14 sm:pb-14 sm:pt-20">
      <Container>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p data-enter-item="1" className="mb-5 text-sm font-medium text-brand-700">
              {eyebrow}
            </p>
            <h1 data-enter-item="2" className="text-4xl font-normal leading-[1.04] tracking-[-0.035em] text-ink sm:text-5xl lg:text-[3.5rem]">
              {title}
            </h1>
            {lead && (
              <p data-enter-item="3" className="mt-5 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
                {lead}
              </p>
            )}
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
