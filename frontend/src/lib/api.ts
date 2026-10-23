/**
 * DentaCare API Client
 * Proxied via Next.js /api to NestJS backend at localhost:4000
 */

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

let refreshPromise: Promise<boolean> | null = null;

async function attemptTokenRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-Token': '1',
        },
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function fetcher<T>(url: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach CSRF protection headers for state-changing requests
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
    headers.set('X-CSRF-Token', '1');
  }

  // Include credentials for cookies (access_token, refresh_token)
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle 401 with bounded single retry and shared in-flight refresh promise
  if (
    res.status === 401 &&
    !url.includes('/api/auth/login') &&
    !url.includes('/api/auth/refresh') &&
    !isRetry
  ) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      return fetcher<T>(url, options, true);
    }
  }

  if (!res.ok) {
    let errorMsg = 'Xatolik yuz berdi';
    try {
      const errJson = await res.json();
      errorMsg = errJson.message || errJson.error || errorMsg;
      if (Array.isArray(errorMsg)) {
        errorMsg = errorMsg.join(', ');
      }
    } catch {}
    const error: any = new Error(errorMsg);
    error.status = res.status;
    throw error;
  }

  // Handle CSV downloads or empty responses
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('text/csv')) {
    return (await res.text()) as unknown as T;
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const api = {
  // Public Information
  getClinicInfo: () => fetcher<any>('/api/public/clinic'),
  getBranches: () => fetcher<any[]>('/api/public/branches'),
  getSpecialties: () => fetcher<any[]>('/api/public/specialties'),
  getDoctors: (branchId?: string, specialty?: string) => {
    const q = new URLSearchParams();
    if (branchId) q.set('branchId', branchId);
    if (specialty) q.set('specialty', specialty);
    return fetcher<any[]>(`/api/public/doctors?${q.toString()}`);
  },
  getDoctorBySlug: (slug: string) => fetcher<any>(`/api/public/doctors/${slug}`),
  getServices: (category?: string) => {
    const q = category ? `?category=${category}` : '';
    return fetcher<any[]>(`/api/public/services${q}`);
  },
  getServiceBySlug: (slug: string) => fetcher<any>(`/api/public/services/${slug}`),
  getAvailableSlots: (
    doctorId: string,
    date: string,
    serviceId?: string,
    branchId?: string,
    _deprecatedDuration?: number,
    serviceIds?: string[],
  ) => {
    const q = new URLSearchParams({ doctorId, date });
    if (serviceId) q.set('serviceId', serviceId);
    if (branchId) q.set('branchId', branchId);
    if (serviceIds && serviceIds.length > 0) q.set('serviceIds', serviceIds.join(','));
    return fetcher<{
      slots: Array<{ startTime: string; endTime: string; available: boolean; branchId?: string; reason?: string }>;
      durationMinutes: number;
      bufferMinutes: number;
      totalDurationWithBufferMinutes: number;
      priceFrom: number;
      serviceName: string;
    }>(`/api/scheduling/slots?${q.toString()}`);
  },

  // Online Appointment Booking
  createBooking: (payload: {
    serviceId?: string;
    serviceIds?: string[];
    doctorId: string;
    branchId?: string;
    startTime: string;
    patientName: string;
    patientPhone: string;
    patientEmail?: string;
    note?: string;
    consentGiven: boolean;
    idempotencyKey?: string;
  }) =>
    fetcher<{
      message: string;
      appointmentId: string;
      publicToken: string;
      status: string;
      startTime: string;
      endTime: string;
      doctorName?: string;
      branchName?: string;
      serviceName?: string;
      durationMinutes?: number;
      bufferMinutes?: number;
      servicePriceFrom?: number;
      serviceItems?: Array<{
        id: string;
        serviceId: string;
        sortOrder: number;
        serviceNameUz: string;
        serviceNameRu?: string;
        durationMinutes: number;
        priceFrom?: number;
      }>;
    }>('/api/booking', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getBookingByToken: (token: string) => fetcher<any>(`/api/booking/status/${token}`),
  getRescheduleSlots: (token: string, date: string, timezone?: string) => {
    const q = new URLSearchParams({ date });
    if (timezone) q.set('timezone', timezone);
    return fetcher<{
      slots: Array<{ startTime: string; endTime: string; available: boolean; reason?: string }>;
      durationMinutes: number;
      bufferMinutes: number;
      totalDurationWithBufferMinutes: number;
      priceFrom?: number;
      serviceName?: string;
      serviceItems?: any[];
    }>(`/api/booking/reschedule/${token}/slots?${q.toString()}`);
  },
  rescheduleBooking: (token: string, startTime: string) =>
    fetcher<any>(`/api/booking/reschedule/${token}`, {
      method: 'POST',
      body: JSON.stringify({ startTime }),
    }),
  cancelBooking: (token: string, reason?: string) =>
    fetcher<any>(`/api/booking/cancel/${token}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Leads & Callbacks
  submitLead: (payload: {
    fullName: string;
    phone: string;
    email?: string;
    preferredBranch?: string;
    preferredTime?: string;
    notes?: string;
    message?: string;
  }) =>
    fetcher<any>('/api/leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Reviews
  getPublicReviews: (page = 1, limit = 20) =>
    fetcher<any>(`/api/reviews?page=${page}&limit=${limit}`),
  submitReview: (payload: {
    authorName: string;
    rating: number;
    text: string;
    consentDisplayName: boolean;
    doctorId?: string;
    serviceId?: string;
  }) =>
    fetcher<any>('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Public CMS
  getArticles: (page = 1, limit = 10) =>
    fetcher<any>(`/api/articles?page=${page}&limit=${limit}`),
  getArticleBySlug: (slug: string) => fetcher<any>(`/api/articles/${slug}`),
  getFaqs: () => fetcher<any[]>('/api/faqs'),
  getSections: () => fetcher<any[]>('/api/homepage-sections'),
  getPolicies: () => fetcher<any>('/api/policies'),

  // Staff Authentication
  login: (email: string, password: string) =>
    fetcher<any>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => fetcher<any>('/api/auth/logout', { method: 'POST' }),
  getProfile: () => fetcher<any>('/api/auth/me'),

  // Admin Appointment Management
  getAdminAppointments: (params: Record<string, any> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    });
    return fetcher<any>(`/api/admin/appointments?${q.toString()}`);
  },
  getAdminMonthAggregates: (params: {
    year: number;
    month: number;
    doctorId?: string;
    branchId?: string;
    status?: string;
  }) => {
    const q = new URLSearchParams({
      year: String(params.year),
      month: String(params.month),
    });
    if (params.doctorId) q.set('doctorId', params.doctorId);
    if (params.branchId) q.set('branchId', params.branchId);
    if (params.status) q.set('status', params.status);
    return fetcher<{
      year: number;
      month: number;
      dailyCounts: Record<string, {
        total: number;
        pending: number;
        confirmed: number;
        checkedIn: number;
        completed: number;
        cancelled: number;
        noShow: number;
      }>;
    }>(`/api/admin/appointments/month-aggregates?${q.toString()}`);
  },
  getTodayAppointments: () => fetcher<any[]>('/api/admin/appointments/today'),
  getAppointmentDetail: (id: string) => fetcher<any>(`/api/admin/appointments/${id}`),
  createAppointmentAdmin: (payload: any) =>
    fetcher<any>('/api/admin/appointments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAppointmentStatus: (id: string, status: string, reason?: string) =>
    fetcher<any>(`/api/admin/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    }),
  startAppointmentTreatment: (id: string) =>
    fetcher<any>(`/api/admin/appointments/${id}/start-treatment`, {
      method: 'POST',
    }),
  recordAppointmentDelay: (id: string, delayMinutes: number, reason?: string) =>
    fetcher<{
      appointmentId: string;
      delayMinutes: number;
      scheduledStartTime: string;
      scheduledEndTime: string;
      estimatedEndTime: string;
      estimatedFreeTime: string;
      bufferMinutes: number;
      affectedCount: number;
      affectedAppointments: Array<{
        id: string;
        patientName: string;
        patientPhone: string;
        scheduledStartTime: string;
        scheduledEndTime: string;
        serviceName: string;
        estimatedDelayMinutes: number;
        estimatedNewStartTime: string;
        status: string;
      }>;
    }>(`/api/admin/appointments/${id}/delay`, {
      method: 'POST',
      body: JSON.stringify({ delayMinutes, reason }),
    }),
  clearAppointmentOverrun: (id: string) =>
    fetcher<any>(`/api/admin/appointments/${id}/clear-overrun`, {
      method: 'POST',
    }),
  adminRescheduleAppointment: (id: string, startTime: string) =>
    fetcher<any>(`/api/admin/appointments/${id}/reschedule`, {
      method: 'PUT',
      body: JSON.stringify({ startTime }),
    }),
  getAdminRescheduleSlots: (id: string, date: string, timezone?: string) => {
    const q = new URLSearchParams({ date });
    if (timezone) q.set('timezone', timezone);
    return fetcher<{
      slots: Array<{ startTime: string; endTime: string; available: boolean; reason?: string }>;
      durationMinutes: number;
      bufferMinutes: number;
      totalDurationWithBufferMinutes: number;
      priceFrom?: number;
      serviceName?: string;
      serviceItems?: any[];
    }>(`/api/admin/appointments/${id}/reschedule-slots?${q.toString()}`);
  },

  // Admin Patient Management
  getAdminPatients: (search?: string, page = 1, limit = 20) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) q.set('search', search);
    return fetcher<any>(`/api/admin/patients?${q.toString()}`);
  },
  getPatientDetail: (id: string) => fetcher<any>(`/api/admin/patients/${id}`),
  getDuplicatePatients: () => fetcher<any[]>('/api/admin/patients/duplicates'),
  mergePatients: (sourceId: string, targetId: string) =>
    fetcher<any>('/api/admin/patients/merge', {
      method: 'POST',
      body: JSON.stringify({ sourceId, targetId }),
    }),
  exportPatientsCsv: (search?: string) => {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return fetcher<string>(`/api/admin/patients/export${q}`);
  },

  // Admin Lead Management
  getAdminLeads: (status?: string, page = 1, limit = 30, search?: string) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) q.set('status', status);
    if (search) q.set('search', search);
    return fetcher<any>(`/api/admin/leads?${q.toString()}`);
  },
  updateLeadStatus: (id: string, status: string, internalNotes?: string) =>
    fetcher<any>(`/api/admin/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, internalNotes, notes: internalNotes }),
    }),

  // Admin Review Moderation
  getAdminReviews: (status?: string, page = 1, limit = 50) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) q.set('status', status);
    return fetcher<any>(`/api/admin/reviews?${q.toString()}`);
  },
  updateReviewStatus: (id: string, status: string) =>
    fetcher<any>(`/api/admin/reviews/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Scheduling & Exceptions
  getDoctorSchedules: (doctorId: string) =>
    fetcher<any[]>(`/api/scheduling/schedules/${doctorId}`),
  setDoctorSchedule: (payload: any) =>
    fetcher<any>('/api/scheduling/schedules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  setBatchSchedules: (payload: {
    doctorIds: string[];
    daysOfWeek: string[];
    startTime: string;
    endTime: string;
    breakStart?: string;
    breakEnd?: string;
    branchId: string;
    mode: 'replace' | 'merge';
  }) =>
    fetcher<any>('/api/scheduling/schedules/batch', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  copyDoctorSchedules: (payload: {
    fromDoctorId: string;
    toDoctorIds: string[];
    mode: 'replace' | 'merge';
    targetBranchId?: string;
  }) =>
    fetcher<any>('/api/scheduling/schedules/copy', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getDoctorExceptions: (doctorId: string) =>
    fetcher<any[]>(`/api/scheduling/exceptions/${doctorId}`),
  addDoctorException: (payload: any) =>
    fetcher<any>('/api/scheduling/exceptions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteDoctorException: (id: string) =>
    fetcher<any>(`/api/scheduling/exceptions/${id}`, { method: 'DELETE' }),

  // Doctor & Service Management (OWNER / ADMIN)
  getAllDoctorsAdmin: () => fetcher<any[]>('/api/doctors/admin/all'),
  createDoctorAdmin: (payload: any) =>
    fetcher<any>('/api/doctors/admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateDoctorAdmin: (id: string, payload: any) =>
    fetcher<any>(`/api/doctors/admin/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  archiveDoctorAdmin: (id: string) =>
    fetcher<any>(`/api/doctors/admin/${id}/archive`, { method: 'PUT' }),

  getAllServicesAdmin: () => fetcher<any[]>('/api/services/admin/all'),
  createServiceAdmin: (payload: any) =>
    fetcher<any>('/api/services/admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateServiceAdmin: (id: string, payload: any) =>
    fetcher<any>(`/api/services/admin/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getLegacyReviewReport: (page = 1, limit = 20) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    return fetcher<{
      unresolvedCount: number;
      verifiedHistoricalCount: number;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      records: any[];
    }>(`/api/services/admin/legacy-review?${q.toString()}`);
  },
  reconcileLegacyRecord: (payload: { itemId: string; action: string; serviceId?: string; reason: string; expectedAuditCount?: number }) =>
    fetcher<any>('/api/services/admin/reconcile-legacy', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin CMS & Content Management
  getAdminArticles: (status?: string, search?: string, page = 1, limit = 50) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) q.set('status', status);
    if (search) q.set('search', search);
    return fetcher<any>(`/api/admin/articles?${q.toString()}`);
  },
  getAdminArticleById: (id: string) => fetcher<any>(`/api/admin/articles/${id}`),
  createArticle: (payload: any) =>
    fetcher<any>('/api/admin/articles', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateArticle: (id: string, payload: any) =>
    fetcher<any>(`/api/admin/articles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteArticle: (id: string) =>
    fetcher<any>(`/api/admin/articles/${id}`, { method: 'DELETE' }),

  getAdminFaqs: () => fetcher<any[]>('/api/admin/faqs'),
  createFaq: (payload: any) =>
    fetcher<any>('/api/admin/faqs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateFaq: (id: string, payload: any) =>
    fetcher<any>(`/api/admin/faqs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteFaq: (id: string) =>
    fetcher<any>(`/api/admin/faqs/${id}`, { method: 'DELETE' }),

  updateHomepageSection: (key: string, body: any) =>
    fetcher<any>(`/api/admin/homepage-sections/${key}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  updatePolicies: (body: any) =>
    fetcher<any>('/api/admin/policies', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  // Staff Management (OWNER)
  getStaffList: () => fetcher<any[]>('/api/admin/staff'),
  createStaff: (payload: any) =>
    fetcher<any>('/api/admin/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateStaff: (id: string, payload: any) =>
    fetcher<any>(`/api/admin/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Clinic Settings & Branches (OWNER / ADMIN)
  getClinicSettingsAdmin: () => fetcher<any>('/api/clinic/settings'),
  updateClinicSettingsAdmin: (payload: any) =>
    fetcher<any>('/api/clinic/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getBranchesAdmin: () => fetcher<any[]>('/api/clinic/branches/all'),
  createBranchAdmin: (payload: any) =>
    fetcher<any>('/api/clinic/branches', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateBranchAdmin: (id: string, payload: any) =>
    fetcher<any>(`/api/clinic/branches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Media Management
  uploadMedia: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetcher<any>('/api/admin/media/upload', {
      method: 'POST',
      body: formData,
    });
  },
  getMediaList: (category?: string, page = 1, limit = 50) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (category) q.set('category', category);
    return fetcher<{ data: any[]; meta: any }>(`/api/admin/media?${q.toString()}`);
  },

  // Analytics & Audit
  getAnalyticsOverview: (
    paramsOrStart?:
      | string
      | {
          startDate?: string;
          endDate?: string;
          branchId?: string;
          doctorId?: string;
          serviceId?: string;
        },
    legacyEnd?: string
  ) => {
    const q = new URLSearchParams();
    if (typeof paramsOrStart === 'string') {
      if (paramsOrStart) q.set('startDate', paramsOrStart);
      if (legacyEnd) q.set('endDate', legacyEnd);
    } else if (paramsOrStart) {
      if (paramsOrStart.startDate) q.set('startDate', paramsOrStart.startDate);
      if (paramsOrStart.endDate) q.set('endDate', paramsOrStart.endDate);
      if (paramsOrStart.branchId) q.set('branchId', paramsOrStart.branchId);
      if (paramsOrStart.doctorId) q.set('doctorId', paramsOrStart.doctorId);
      if (paramsOrStart.serviceId) q.set('serviceId', paramsOrStart.serviceId);
    }
    return fetcher<any>(`/api/admin/analytics/overview?${q.toString()}`);
  },
  getAuditLogs: (page = 1, limit = 50) =>
    fetcher<any>(`/api/admin/audit-logs?page=${page}&limit=${limit}`),
};
