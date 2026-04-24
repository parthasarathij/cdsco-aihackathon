
import { getApiOrigin } from './base';

const API_BASE_URL = getApiOrigin();

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface ApiError {
  status: number;
  message: string;
}


async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText, message: response.statusText }));
      const errorMessage = error.detail || error.message || `API Error: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`API Error: ${endpoint}`, message);
    return {
      success: false,
      error: message,
    };
  }
}


async function apiUpload<T>(
  endpoint: string,
  formData: FormData,
  options: Omit<RequestInit, 'body'> = {}
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      ...options,
      body: formData,
      headers: {
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText, message: response.statusText }));
      const errorMessage = error.detail || error.message || `Upload Error: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    console.error(`Upload Error: ${endpoint}`, message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Anonymisation API endpoints
 */
export const anonymisationApi = {
  anonymise: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiUpload('/anonymisation/process', formData);
  },
};

/**
 * Summarisation API endpoints
 */
export const summarisationApi = {
  summarise: (file: File, additionalFiles?: File[]) => {
    const formData = new FormData();
    formData.append('file', file);
    if (additionalFiles) {
      additionalFiles.forEach((f, idx) => formData.append(`additional_${idx}`, f));
    }
    return apiUpload('/summarisation/process', formData);
  },
};

/**
 * Classification API endpoints
 */
export const classificationApi = {
  classify: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return apiUpload('/v1/classify/', formData);
  },
  classifyOtherFiles: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return apiUpload('/classify-other-files', formData);
  },
};

/**
 * Completeness API endpoints
 */
export const completenessApi = {
  check: (oldFile: File, newFile: File) => {
    const formData = new FormData();
    formData.append('old_file', oldFile);
    formData.append('new_file', newFile);
    return apiUpload('/completeness/check', formData);
  },
};


/**
 * Generic API methods
 */
export const apiClient = {
  /**
   * GET request
   */
  get: <T,>(endpoint: string, options?: RequestInit) =>
    apiFetch<T>(endpoint, { ...options, method: 'GET' }),

  /**
   * POST request with JSON body
   */
  post: <T,>(endpoint: string, data?: unknown, options?: RequestInit) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  /**
   * PUT request with JSON body
   */
  put: <T,>(endpoint: string, data?: unknown, options?: RequestInit) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  /**
   * PATCH request with JSON body
   */
  patch: <T,>(endpoint: string, data?: unknown, options?: RequestInit) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),

  /**
   * DELETE request
   */
  delete: <T,>(endpoint: string, options?: RequestInit) =>
    apiFetch<T>(endpoint, { ...options, method: 'DELETE' }),

  /**
   * Upload FormData
   */
  upload: <T,>(endpoint: string, formData: FormData, options?: Omit<RequestInit, 'body'>) =>
    apiUpload<T>(endpoint, formData, options),
};

export type { ApiResponse, ApiError };
