export interface AnonymisationChangeRow {
  serial_no?: number;
  entity_type: string;
  original_value: string;
  pseudo_value: string | null;
  full_anon_value: string | null;
  detection_source?: string;
  confidence?: number;
  occurrences?: number;
}

export interface AnonymisationJsonReport {
  message?: string;
  original_text?: string | null;
  total_entities_found?: number;
  total_values_changed?: number;
  changes: AnonymisationChangeRow[];
  pseudo_document?: string | null;
  full_anon_document?: string | null;
  mapping_excel_url?: string | null;
  mapping_table?: { entries: unknown[] };
}

export interface AnonymisationResultItem {
  path: string;
  name: string;
  file: File;
  blobPath?: string;
  report: AnonymisationJsonReport;
  pseudoBlob?: Blob;
  pseudoBlobPath?: string;
  fullBlob?: Blob;
  fullBlobPath?: string;
  error?: string;
}
