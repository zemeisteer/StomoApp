'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { I18nProvider } from '../lib/i18n';
import { AuthProvider } from '../lib/auth';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { BrandProvider, type PublicClinicBrand } from '../lib/brand';

export const ClientLayout: React.FC<{ children: React.ReactNode; initialClinic: PublicClinicBrand | null }> = ({
  children,
  initialClinic,
}) => {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith('/admin');

  return (
    <BrandProvider initialClinic={initialClinic}>
    <I18nProvider>
      <AuthProvider>
        {isAdminRoute ? (
          <main className="min-h-screen">{children}</main>
        ) : (
          <div className="site-public">
            <a href="#main" className="skip-link">
              Asosiy qismga o‘tish
            </a>
            <Header />
            <main id="main" className="min-h-screen bg-white">
              {children}
            </main>
            <Footer />
          </div>
        )}
      </AuthProvider>
    </I18nProvider>
    </BrandProvider>
  );
};
