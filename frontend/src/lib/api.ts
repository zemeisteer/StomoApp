/**
 * DentaCare API Client
 * Proxied via Next.js /api to NestJS backend at localhost:4000
 */

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

const getBaseUrl = () => {
  return ''; // Next.js rewrite proxies /api to backend
};

async function fetcher<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Include credentials for cookies (access_token, refresh_token)
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

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
  // Public
  getClinicInfo: () => fetcher<any>('/api/public/clinic'),
  getBranches: () => fetcher<any[]>('/api/public/branches'),
  getSpecialties: () => fetcher<any[]>('/api/public/specialties'),
  getDoctors: (branchId?: string, specialtyId?: string) => {
    const q = new URLSearchParams();
    if (branchId) q.set('branchId', branchId);
    if (specialtyId) q.set('specialtyId', specialtyId);
    return fetcher<any[]>(`/api/public/doctors?${q.toString()}`);
  },
  getDoctorBySlug: (slug: string) => fetcher<any>(`/api/public/doctors/${slug}`),
  getServices: (category?: string) => {
    const q = category ? `?category=${category}` : '';
    return fetcher<any[]>(`/api/public/services${q}`);
  },
  getServiceBySlug: (slug: string) => fetcher<any>(`/api/public/services/${slug}`),
  getAvailableSlots: (doctorId: string, date: string, serviceId: string, branchId?: string) => {
    const q = new URLSearchParams({ doctorId, date, serviceId });
    if (branchId) q.set('branchId', branchId);
    return fetcher<any[]>(`/api/scheduling/slots?${q.toString()}`);
  },
  createBooking: (payload: {
    serviceId: string;
    doctorId: string;
    branchId?: string;
    startTime: string;
    patientName: string;
    patientPhone: string;
    patientEmail?: string;
    note?: string;
    consentGiven: boolean;
    idempotencyKey?: string;
  }) => fetcher<{
    message: string;
    appointmentId: string;
    publicToken: string;
    status: string;
    startTime: string;
    endTime: string;
    doctorName: string;
    serviceName: string;
    branchName: string;
  }>('/api/booking', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getBookingByToken: (token: string) => fetcher<any>(`/api/booking/status/${token}`),
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
  submitLead: (payload: { fullName: string; phone: string; preferredBranch?: string; preferredTime?: string; notes?: string }) =>
    fetcher<any>('/api/leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getPublicReviews: (page = 1, limit = 20) => fetcher<any>(`/api/reviews?page=${page}&limit=${limit}`),
  submitReview: (payload: { authorName: string; rating: number; text: string; consentDisplayName: boolean; doctorId?: string; serviceId?: string }) =>
    fetcher<any>('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getArticles: (page = 1, limit = 10) => fetcher<any>(`/api/cms/articles?page=${page}&limit=${limit}`),
  getArticleBySlug: (slug: string) => fetcher<any>(`/api/cms/articles/${slug}`),
  getFaqs: (category?: string) => fetcher<any[]>(`/api/cms/faqs${category ? `?category=${category}` : ''}`),
  getSections: () => fetcher<any[]>('/api/cms/sections'),

  // Admin Auth
  login: (email: string, password: string) =>
    fetcher<any>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => fetcher<any>('/api/auth/logout', { method: 'POST' }),
  getProfile: () => fetcher<any>('/api/auth/me'),

  // Admin Operations
  getAdminAppointments: (params: Record<string, any> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    });
    return fetcher<any>(`/api/admin/appointments?${q.toString()}`);
  },
  getTodayAppointments: () => fetcher<any[]>('/api/admin/appointments/today'),
  getAppointmentDetail: (id: string) => fetcher<any>(`/api/admin/appointments/${id}`),
  updateAppointmentStatus: (id: string, status: string, reason?: string) =>
    fetcher<any>(`/api/admin/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    }),
  adminRescheduleAppointment: (id: string, startTime: string) =>
    fetcher<any>(`/api/admin/appointments/${id}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ startTime }),
    }),
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
  getAdminLeads: (status?: string, page = 1, limit = 30) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) q.set('status', status);
    return fetcher<any>(`/api/admin/leads?${q.toString()}`);
  },
  updateLeadStatus: (id: string, status: string, notes?: string) =>
    fetcher<any>(`/api/admin/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    }),
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
  getDoctorSchedules: (doctorId: string) => fetcher<any[]>(`/api/scheduling/schedules/${doctorId}`),
  setDoctorSchedule: (payload: any) =>
    fetcher<any>('/api/scheduling/schedules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getDoctorExceptions: (doctorId: string) => fetcher<any[]>(`/api/scheduling/exceptions/${doctorId}`),
  addDoctorException: (payload: any) =>
    fetcher<any>('/api/scheduling/exceptions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteDoctorException: (id: string) =>
    fetcher<any>(`/api/scheduling/exceptions/${id}`, { method: 'DELETE' }),
  getAnalyticsOverview: (startDate?: string, endDate?: string) => {
    const q = new URLSearchParams();
    if (startDate) q.set('startDate', startDate);
    if (endDate) q.set('endDate', endDate);
    return fetcher<any>(`/api/admin/analytics/overview?${q.toString()}`);
  },
  getAuditLogs: (page = 1, limit = 50) =>
    fetcher<any>(`/api/admin/audit-logs?page=${page}&limit=${limit}`),
};
