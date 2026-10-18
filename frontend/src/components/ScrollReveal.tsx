'use client';

import React, { useEffect, useRef, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
  durationMs?: number;
  distancePx?: number;
  once?: boolean;
}

export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  className = '',
  delayMs = 0,
  durationMs = 500,
  distancePx = 16,
  once = true,
}) => {
  // CRITICAL: isHydrated starts false so initial SSR and zero-JS renders are 100% visible (opacity: 1)
  const [isHydrated, setIsHydrated] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      // 1. Detect reduced motion preference immediately
      if (typeof window !== 'undefined') {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const reduced = mediaQuery.matches;
        setPrefersReducedMotion(reduced);

        const handleMotionChange = (e: MediaQueryListEvent) => {
          setPrefersReducedMotion(e.matches);
        };
        mediaQuery.addEventListener?.('change', handleMotionChange);

        if (reduced) {
          setIsHydrated(true);
          setIsVisible(true);
          return () => mediaQuery.removeEventListener?.('change', handleMotionChange);
        }

        // 2. Client mounted & reduced motion is false -> enable progressive animation
        setIsHydrated(true);

        const node = ref.current;
        if (!node || typeof IntersectionObserver === 'undefined') {
          setIsVisible(true);
          return () => mediaQuery.removeEventListener?.('change', handleMotionChange);
        }

        const observer = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (!entry) return;

            if (entry.isIntersecting) {
              setIsTransitioning(true);
              setIsVisible(true);

              if (timerRef.current) clearTimeout(timerRef.current);
              timerRef.current = setTimeout(() => {
                setIsTransitioning(false); // Remove will-change after transition completes
              }, durationMs + delayMs + 100);

              if (once) {
                observer.unobserve(node);
              }
            } else if (!once) {
              setIsVisible(false);
            }
          },
          {
            threshold: 0.1,
            rootMargin: '0px 0px -30px 0px',
          }
        );

        observer.observe(node);

        return () => {
          observer.disconnect();
          mediaQuery.removeEventListener?.('change', handleMotionChange);
        };
      }
    } catch {
      // Fail-open: if anything fails during observer setup, keep content visible
      setIsHydrated(false);
      setIsVisible(true);
    }
  }, [once, durationMs, delayMs]);

  // If not hydrated yet (SSR) or user prefers reduced motion, render clean accessible visible markup
  if (!isHydrated || prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      style={{
        transitionProperty: 'opacity, transform',
        transitionDuration: `${durationMs}ms`,
        transitionDelay: `${delayMs}ms`,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isVisible ? 'translateY(0)' : `translateY(${distancePx}px)`,
        opacity: isVisible ? 1 : 0,
        willChange: isTransitioning ? 'opacity, transform' : 'auto',
      }}
      className={className}
    >
      {children}
    </div>
  );
};
