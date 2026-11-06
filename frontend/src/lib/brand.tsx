'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { applyBrandToDocument, type BrandColors } from './brandTheme';

export type PublicClinicBrand = BrandColors & {
  name?: string | null;
  nameRu?: string | null;
  logo?: string | null;
  phone?: string | null;
  [key: string]: unknown;
};

type BrandContextValue = {
  clinic: PublicClinicBrand | null;
  /** Display name for the active language, falling back to the Uzbek name. */
  clinicName: (lang?: string) => string;
  logo: string | null;
  /** Update branding in place (e.g. right after the owner saves settings). */
  updateBrand: (patch: Partial<PublicClinicBrand>) => void;
};

const FALLBACK_NAME = 'DentaCare';

const BrandContext = createContext<BrandContextValue>({
  clinic: null,
  clinicName: () => FALLBACK_NAME,
  logo: null,
  updateBrand: () => {},
});

export function BrandProvider({
  initialClinic,
  children,
}: {
  initialClinic: PublicClinicBrand | null;
  children: React.ReactNode;
}) {
  const [clinic, setClinic] = useState<PublicClinicBrand | null>(initialClinic);

  // The server already rendered the theme; only fetch when it could not reach the backend.
  useEffect(() => {
    if (initialClinic) return;
    let alive = true;
    api
      .getClinicInfo()
      .then((info) => {
        if (!alive || !info) return;
        setClinic(info);
        applyBrandToDocument(info);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [initialClinic]);

  const updateBrand = useCallback((patch: Partial<PublicClinicBrand>) => {
    setClinic((prev) => {
      const next = { ...(prev || {}), ...patch };
      applyBrandToDocument(next);
      return next;
    });
  }, []);

  const value = useMemo<BrandContextValue>(
    () => ({
      clinic,
      clinicName: (lang) =>
        (lang === 'ru' ? clinic?.nameRu || clinic?.name : clinic?.name) || FALLBACK_NAME,
      logo: clinic?.logo || null,
      updateBrand,
    }),
    [clinic, updateBrand],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);
