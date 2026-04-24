const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function request<T>(
  path: string,
  method: string = "GET",
  body?: any,
  headers: Record<string, string> = {}
): Promise<T> {
  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      options.body = JSON.stringify(body);
      options.headers = {
        ...options.headers,
        "Content-Type": "application/json",
      };
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, options);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail;
    const message =
      (typeof detail === "string" && detail) ||
      detail?.message ||
      payload?.message ||
      `API Error: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  // Handle blob responses (e.g., for file downloads)
  const contentType = response.headers.get("Content-Type");
  if (contentType && (contentType.includes("application/zip") || contentType.includes("application/octet-stream") || contentType.includes("application/pdf") || contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))) {
    return (await response.blob()) as any;
  }

  return response.json();
}

export const api = {
  // Dossier Checker
  dossierChecker: {
    upload: (formData: FormData) => request("/dossier-checker/upload", "POST", formData),
  },

  // Anonymisation
  anonymisation: {
    health: () => request("/anonymisation/health-anon", "GET"),
    getEntityFields: () => request("/anonymisation/entity-fields", "GET"),
    listExports: () => request("/anonymisation/exports/list", "GET"),
    process: (body: any) => request("/anonymisation/process", "POST", body),
    detectOnly: (body: any) => request("/anonymisation/detect-only", "POST", body),
    upload: (formData: FormData) => request("/anonymisation/upload", "POST", formData),
    processDocx: (formData: FormData) => request("/anonymisation/process-docx", "POST", formData),
    uploadDocx: (formData: FormData) => request("/anonymisation/upload-docx", "POST", formData),
    uploadDocxPseudo: (formData: FormData) => request("/anonymisation/upload-docx/pseudo", "POST", formData),
    uploadDocxFull: (formData: FormData) => request("/anonymisation/upload-docx/full", "POST", formData),
    uploadDocxJson: (formData: FormData) => request("/anonymisation/upload-docx/json", "POST", formData),
  },

  // Summarization
  summarization: {
    summarize: (formData: FormData) => request("/api/v1/summarize/", "POST", formData),
    saeSummarize: (formData: FormData) => request("/api/v1/sae_summarize/", "POST", formData),
    meetingSummarize: (formData: FormData) => request("/api/v1/meeting_summarize/", "POST", formData),
  },

  // SAE Summarization (alias)
  saeSummarization: {
    summarize: (formData: FormData) => request("/api/v1/sae_summarize/", "POST", formData),
  },

  // Meeting Summarization (alias)
  meetingSummarization: {
    summarize: (formData: FormData) => request("/api/v1/meeting_summarize/", "POST", formData),
  },

  // Classification
  classification: {
    classifyOtherFiles: (formData: FormData) => request("/api/v1/classify/classify-other-files", "POST", formData),
    classifySae: (formData: FormData) => request("/api/v1/classify/", "POST", formData),
    classifyOtherFilesLegacy: (formData: FormData) => request("/classify-other-files", "POST", formData),
  },

  // Default / Other
  common: {
    analyzeDocument: (formData: FormData) => request("/analyze-document", "POST", formData),
    health: () => request("/health", "GET"),
    uploadFile: (formData: FormData) => request("/upload/file", "POST", formData),
    uploadFolder: (formData: FormData) => request("/upload/folder", "POST", formData),
    uploadZip: (formData: FormData) => request("/upload/zip", "POST", formData),
    getTree: () => request("/tree", "GET"),
    getFile: (params: string) => request(`/file?${params}`, "GET"),
    getFileUrl: (params: string) => request(`/file-url?${params}`, "GET"),
    createZipFromBlob: (body: any) => request("/create-zip-from-blob", "POST", body),
    consistencyCheckFromBlob: (body: any) => request("/consistency-check-from-blob", "POST", body),
    completeness: (formData: FormData) => request("/completeness", "POST", formData),
    clearWorkspace: () => request("/clear", "DELETE"),
    versionChecker: (formData: FormData) => request("/version-checker", "POST", formData),
    // Upload a zipped dossier (M1-M5 folders/files) for backend consistency checks.
    consistencyCheckUpload: (formData: FormData) => request("/completeness", "POST", formData),
    classifyOtherFiles: (formData: FormData) => request("/api/classify-other-files", "POST", formData),
    summarizeOtherFiles: (formData: FormData) => request("/summarize-other-files", "POST", formData),
    analyzeDossier: (formData: FormData) => request("/analyze-dossier", "POST", formData),
    checkSpecifications: (formData: FormData) => request("/api/check-specifications", "POST", formData),
  },
};
