'use client';

import React, { useEffect, useState } from 'react';
import { HeroSection } from '../components/home/HeroSection';
import { ServicesSection } from '../components/home/ServicesSection';
import { DoctorsSection } from '../components/home/DoctorsSection';
import { ClinicSection } from '../components/home/ClinicSection';
import { ReviewsSection } from '../components/home/ReviewsSection';
import { BranchesSection } from '../components/home/BranchesSection';
import { FaqAndCtaSection } from '../components/home/FaqAndCtaSection';
import { api } from '../lib/api';

export default function HomePage() {
  const [services, setServices] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadHomeData() {
      try {
        const [servicesRes, doctorsRes, reviewsRes, branchesRes] = await Promise.all([
          api.getServices().catch(() => []),
          api.getDoctors().catch(() => []),
          api.getPublicReviews(1, 6).catch(() => ({ items: [] })),
          api.getBranches().catch(() => []),
        ]);

        if (!isMounted) return;
        setServices(Array.isArray(servicesRes) ? servicesRes.slice(0, 6) : []);
        setDoctors(Array.isArray(doctorsRes) ? doctorsRes.slice(0, 4) : []);
        setReviews(reviewsRes?.items || []);
        setBranches(Array.isArray(branchesRes) ? branchesRes : []);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Failed to load home data', err);
        setFetchError('Ma\'lumotlarni yuklashda xatolik yuz berdi');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadHomeData();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-4 pb-16 overflow-hidden">
      {/* 1. Hero Section with 3D Tooth Model */}
      <HeroSection />

      {/* 2. Popular Services Section */}
      <ServicesSection
        services={services}
        isLoading={isLoading}
        error={fetchError}
      />

      {/* 3. Doctors Section (Light, photo-led) */}
      <DoctorsSection
        doctors={doctors}
        isLoading={isLoading}
      />

      {/* 4. Clinic Standards & Quality Section */}
      <ClinicSection />

      {/* 5. Patient Reviews Section */}
      <ReviewsSection
        reviews={reviews}
      />

      {/* 6. Branches & Locations Section */}
      <BranchesSection
        branches={branches}
        isLoading={isLoading}
      />

      {/* 7. FAQ Accordion & Final Booking CTA */}
      <FaqAndCtaSection />
    </div>
  );
}
