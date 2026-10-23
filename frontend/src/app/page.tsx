'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { HeroSection } from '../components/home/HeroSection';
import { ServicesSection } from '../components/home/ServicesSection';
import { DoctorsSection } from '../components/home/DoctorsSection';
import { ClinicSection } from '../components/home/ClinicSection';
import { ReviewsSection } from '../components/home/ReviewsSection';
import { BranchesSection } from '../components/home/BranchesSection';
import { FaqAndCtaSection } from '../components/home/FaqAndCtaSection';
import { ScrollReveal } from '../components/ScrollReveal';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

interface SectionState<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
}

export default function HomePage() {
  const { t, language } = useI18n();

  const [servicesState, setServicesState] = useState<SectionState<any[]>>({
    data: [],
    isLoading: true,
    error: null,
  });

  const [doctorsState, setDoctorsState] = useState<SectionState<any[]>>({
    data: [],
    isLoading: true,
    error: null,
  });

  const [reviewsState, setReviewsState] = useState<SectionState<any[]>>({
    data: [],
    isLoading: true,
    error: null,
  });

  const [branchesState, setBranchesState] = useState<SectionState<any[]>>({
    data: [],
    isLoading: true,
    error: null,
  });

  const [faqsState, setFaqsState] = useState<SectionState<any[]>>({
    data: [],
    isLoading: true,
    error: null,
  });

  // Independent fetchers with retry support
  const fetchServices = useCallback(async () => {
    setServicesState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await api.getServices();
      const list = Array.isArray(res) ? res.slice(0, 6) : [];
      setServicesState({ data: list, isLoading: false, error: null });
    } catch (err: any) {
      setServicesState((prev) => ({
        ...prev,
        isLoading: false,
        error: err?.message || t.common.error,
      }));
    }
  }, [t.common.error]);

  const fetchDoctors = useCallback(async () => {
    setDoctorsState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await api.getDoctors();
      const list = Array.isArray(res) ? res.slice(0, 4) : [];
      setDoctorsState({ data: list, isLoading: false, error: null });
    } catch (err: any) {
      setDoctorsState((prev) => ({
        ...prev,
        isLoading: false,
        error: err?.message || t.common.error,
      }));
    }
  }, [t.common.error]);

  const fetchReviews = useCallback(async () => {
    setReviewsState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await api.getPublicReviews(1, 6);
      const list = res?.items || (Array.isArray(res) ? res : []);
      setReviewsState({ data: list, isLoading: false, error: null });
    } catch (err: any) {
      setReviewsState((prev) => ({
        ...prev,
        isLoading: false,
        error: err?.message || t.common.error,
      }));
    }
  }, [t.common.error]);

  const fetchBranches = useCallback(async () => {
    setBranchesState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await api.getBranches();
      const list = Array.isArray(res) ? res : [];
      setBranchesState({ data: list, isLoading: false, error: null });
    } catch (err: any) {
      setBranchesState((prev) => ({
        ...prev,
        isLoading: false,
        error: err?.message || t.common.error,
      }));
    }
  }, [t.common.error]);

  const fetchFaqs = useCallback(async () => {
    setFaqsState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await api.getFaqs();
      const list = Array.isArray(res) ? res : [];
      setFaqsState({ data: list, isLoading: false, error: null });
    } catch (err: any) {
      setFaqsState((prev) => ({
        ...prev,
        isLoading: false,
        error: err?.message || t.common.error,
      }));
    }
  }, [t.common.error]);

  // Initial load: fetch all independently
  useEffect(() => {
    fetchServices();
    fetchDoctors();
    fetchReviews();
    fetchBranches();
    fetchFaqs();
  }, [fetchServices, fetchDoctors, fetchReviews, fetchBranches, fetchFaqs]);

  return (
    <div className="space-y-4 pb-16 overflow-hidden">
      {/* 1. Hero Section with 3D Tooth Model - Main heading immediately visible */}
      <HeroSection />

      {/* 2. Popular Services Section */}
      <ScrollReveal durationMs={240} distancePx={16}>
        <ServicesSection
          services={servicesState.data}
          isLoading={servicesState.isLoading}
          error={servicesState.error}
          onRetry={fetchServices}
        />
      </ScrollReveal>

      {/* 3. Doctors Section (Light, photo-led) */}
      <ScrollReveal durationMs={240} distancePx={16}>
        <DoctorsSection
          doctors={doctorsState.data}
          isLoading={doctorsState.isLoading}
          error={doctorsState.error}
          onRetry={fetchDoctors}
        />
      </ScrollReveal>

      {/* 4. Clinic Standards & Quality Section */}
      <ScrollReveal durationMs={240} distancePx={16}>
        <ClinicSection />
      </ScrollReveal>

      {/* 5. Patient Reviews Section */}
      <ScrollReveal durationMs={240} distancePx={16}>
        <ReviewsSection
          reviews={reviewsState.data}
          isLoading={reviewsState.isLoading}
          error={reviewsState.error}
          onRetry={fetchReviews}
        />
      </ScrollReveal>

      {/* 6. Branches & Locations Section */}
      <ScrollReveal durationMs={240} distancePx={16}>
        <BranchesSection
          branches={branchesState.data}
          isLoading={branchesState.isLoading}
          error={branchesState.error}
          onRetry={fetchBranches}
        />
      </ScrollReveal>

      {/* 7. FAQ Accordion & Final Booking CTA */}
      <ScrollReveal durationMs={240} distancePx={16}>
        <FaqAndCtaSection
          faqs={faqsState.data}
          isLoading={faqsState.isLoading}
          error={faqsState.error}
          onRetry={fetchFaqs}
        />
      </ScrollReveal>
    </div>
  );
}
