export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  extension: string;
  children: FileNode[];
  blobPath: string;
  file?: File | null;
}

export type FeatureId =
  | 'anonymisation'
  | 'summarisation'
  | 'completeness'
  | 'classification'

export interface AppState {
  files: FileNode[];
  selectedFile: FileNode | null;
  expandedFolders: Record<string, boolean>;
  selectedFeature: FeatureId | null;
  resultVisible: boolean;
}
