import { getApiOrigin } from '../../../shared/api/base';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function apiOrigin(): string {
  return getApiOrigin();
}

async function upload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${apiOrigin()}${endpoint}`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return { success: false, error: payload.detail || payload.message || response.statusText };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return { success: false, error: message };
  }
}

export const classificationClient = {
  classify(files: File[]) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return upload('/api/v1/classify/', formData);
  },
  classifyOtherFiles(files: File[]) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return upload('/classify-other-files', formData);
  },
};

