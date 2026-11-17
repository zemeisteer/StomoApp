'use client';

import React, { useEffect, useRef, useState } from 'react';
import { altOf, srcSet, type SitePhoto } from '../../lib/sitePhotos';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A plain responsive photograph that fills its frame (cover). */
export function Photo({
  photo,
  lang,
  sizes,
  eager = false,
  className = '',
  position,
}: {
  photo: SitePhoto;
  lang: string;
  sizes: string;
  eager?: boolean;
  className?: string;
  position?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${photo.base}.webp`}
      srcSet={srcSet(photo)}
      sizes={sizes}
      width={photo.width}
      height={photo.height}
      alt={altOf(photo, lang)}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      data-source="stand-in"
      className={`h-full w-full object-cover ${className}`}
      style={position ? { objectPosition: position } : undefined}
    />
  );
}

/**
 * picture-develops (film look): the photograph waits as a pale print just before it scrolls in,
 * then develops once (about 1.6 s). Reduced motion, no script or no observer: the photograph stands.
 */
export function DevelopingPhoto({ className = '', children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'armed' | 'live'>('idle');

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || typeof IntersectionObserver === 'undefined') return;
    const near = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setState((s) => (s === 'idle' ? 'armed' : s));
          near.disconnect();
        }
      },
      { rootMargin: '0px 0px 25% 0px' },
    );
    const seen = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setState('live');
          seen.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    near.observe(el);
    seen.observe(el);
    // nothing waits for ever: if no observer reports, the picture is simply shown
    const rescue = window.setTimeout(() => setState((s) => (s === 'armed' ? 'live' : s)), 3000);
    return () => {
      near.disconnect();
      seen.disconnect();
      window.clearTimeout(rescue);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-moment="picture-develops"
      className={`develop relative overflow-hidden ${state === 'armed' ? 'is-armed' : ''} ${state === 'live' ? 'is-live' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export type Chapter = { title: string; body: string; photo: SitePhoto; position?: string };

/**
 * pinned-chapters: the section holds on screen for one screen of scroll while its steps open one
 * at a time and the frame on the right changes to each step's photograph. From 1024px on a screen
 * at least 640px tall; otherwise each step is a static row with its own photograph.
 */
export function PinnedChapters({
  id,
  eyebrow,
  title,
  lead,
  chapters,
  lang,
}: {
  id?: string;
  eyebrow: string;
  title: React.ReactNode;
  lead?: string;
  chapters: Chapter[];
  lang: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [live, setLive] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const fits = () => !reduced() && window.matchMedia('(min-width: 1024px)').matches && window.innerHeight >= 640;
    const sync = () => setLive(fits());
    sync();
    let t = 0;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(sync, 120);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!live) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      setActive(Math.min(chapters.length - 1, Math.floor(p * chapters.length)));
    };
    const req = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener('scroll', req, { passive: true });
    req();
    return () => {
      window.removeEventListener('scroll', req);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [live, chapters.length]);

  return (
    <section ref={ref} id={id} data-moment="pinned-chapters" className={`pc bg-white ${live ? 'is-live' : 'py-20 sm:py-28'}`}>
      <div className="pc-stage">
        <div className="mx-auto w-full max-w-[1344px] px-5 sm:px-8">
          <div className={live ? 'grid grid-cols-2 items-center gap-12' : ''} data-edge-free={live ? '' : undefined}>
            <div>
              <p className="mb-4 text-sm font-medium text-brand-700">{eyebrow}</p>
              <h2 className="max-w-xl text-3xl font-normal leading-[1.08] tracking-[-0.03em] text-ink sm:text-[2.75rem]">{title}</h2>
              {lead && <p className="mt-4 max-w-lg text-base leading-relaxed text-ink-muted sm:text-lg">{lead}</p>}
              <ol className={`mt-10 grid ${live ? 'gap-6' : 'gap-0 border-b border-line'}`}>
                {chapters.map((c, i) => (
                  <li
                    key={c.title}
                    className={`pc-step ${live && i === active ? 'is-on' : ''} ${
                      live ? '' : 'grid gap-5 border-t border-line py-8 sm:grid-cols-2 sm:items-center sm:gap-10'
                    }`}
                  >
                    <div>
                      <h3 className="flex items-baseline gap-3 text-xl font-medium tracking-[-0.01em] text-ink">
                        <span className="text-sm tabular-nums text-ink-muted">{String(i + 1).padStart(2, '0')}</span>
                        {c.title}
                      </h3>
                      <div className="pc-body">
                        <div>
                          <p className="pt-2 text-base leading-relaxed text-ink-muted">{c.body}</p>
                        </div>
                      </div>
                    </div>
                    <div className="pc-inline aspect-[16/9] overflow-hidden rounded-2xl bg-canvas sm:aspect-[4/3] sm:max-h-[30svh] sm:w-full">
                      <Photo photo={c.photo} lang={lang} sizes="(min-width: 640px) 45vw, 100vw" position={c.position} />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="pc-frame relative aspect-[4/3] max-h-[calc(100svh-160px)] w-full overflow-hidden rounded-3xl bg-canvas" aria-hidden={!live}>
              {chapters.map((c, i) => (
                <figure key={c.title} className={`${i === active ? 'is-on' : ''} ${i < active ? 'is-past' : ''}`}>
                  <Photo photo={c.photo} lang={lang} sizes="50vw" position={c.position} />
                </figure>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
