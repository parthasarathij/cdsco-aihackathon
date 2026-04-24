import { useState, useRef } from "react";
import { api } from "../../services/api";
import {
  ArrowLeft,
  FileText,
  Paperclip,
  X,
  AlertCircle,
  GitCompare,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface VersionFile {
  file: File | null;
  label: string;
  tag: string;
  color: string;
  borderColor: string;
  bgColor: string;
  tagBg: string;
  tagColor: string;
}

interface VersionDiffItem {
  document_added: string;
  path_in_zip: string;
  Description: string | null;
}

interface CompareResponse {
  only_in_zip_a: VersionDiffItem[];
  only_in_zip_b: VersionDiffItem[];
}

/* ─────────────────────────────────────────────
   Version slot config
───────────────────────────────────────────── */
const VERSION_CONFIG: Omit<VersionFile, "file">[] = [
  {
    label: "Version 1",
    tag: "V1",
    color: "#1D4ED8",
    borderColor: "#93C5FD",
    bgColor: "#EFF6FF",
    tagBg: "#DBEAFE",
    tagColor: "#1D4ED8",
  },
  {
    label: "Version 2",
    tag: "V2",
    color: "#7C3AED",
    borderColor: "#C4B5FD",
    bgColor: "#F5F3FF",
    tagBg: "#EDE9FE",
    tagColor: "#7C3AED",
  },
];

/* ─────────────────────────────────────────────
   Props
───────────────────────────────────────────── */
export interface VersionCheckProps {
  /** Called when the user clicks "Back to Checklist".
   *  Optional — omit when used as a standalone route. */
  onBack?: () => void;
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
export function VersionCheck({ onBack }: VersionCheckProps) {
  const [versions, setVersions] = useState<VersionFile[]>(
    VERSION_CONFIG.map((cfg) => ({ ...cfg, file: null }))
  );
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(true);

  const fileRef0 = useRef<HTMLInputElement>(null);
  const fileRef1 = useRef<HTMLInputElement>(null);
  const fileRefs = [fileRef0, fileRef1];

  const allUploaded = versions.every((v) => v.file !== null);
  const uploadedCount = versions.filter((v) => v.file !== null).length;

  /* handlers */
  const handleFile = (idx: number, file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Please upload a .zip file for each version.");
      if (fileRefs[idx].current) fileRefs[idx].current!.value = "";
      return;
    }
    setVersions((prev) => prev.map((v, i) => (i === idx ? { ...v, file } : v)));
    setResults(null);
    setError(null);
  };

  const handleRemove = (idx: number) => {
    setVersions((prev) => prev.map((v, i) => (i === idx ? { ...v, file: null } : v)));
    setResults(null);
    setError(null);
    if (fileRefs[idx].current) fileRefs[idx].current!.value = "";
  };

  const handleRunCheck = async () => {
    if (!allUploaded || !versions[0].file || !versions[1].file) return;
    setChecking(true);
    setResults(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("zip_a", versions[0].file);
      formData.append("zip_b", versions[1].file);

      const data = await api.common.versionChecker(formData);
      setResults(data as any);
      setShowResults(true);
    } catch (err) {
      console.error("Comparison error:", err);
      setError("Failed to run version check. Please ensure both files are valid ZIP archives.");
    } finally {
      setChecking(false);
    }
  };

  /* badge meta */
  const statusMeta = {
    match: { label: "Match", bg: "#DCFCE7", color: "#15803D", border: "#86EFAC", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    minor: { label: "Minor Diff", bg: "#FEF3C7", color: "#92400E", border: "#FCD34D", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    conflict: { label: "Conflict", bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5", icon: <AlertCircle className="w-3.5 h-3.5" /> },
  };

  const onlyA = results?.only_in_zip_a || [];
  const onlyB = results?.only_in_zip_b || [];
  const totalDiffs = onlyA.length + onlyB.length;

  /* ── render ── */
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F0F2F5" }}>

      {/* ── Header ── */}
      <header style={{ background: "#1E3A5F" }} className="shadow-lg">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.1)" }}>
            <GitCompare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white" style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "0.01em" }}>
              Document Submission Portal
            </h1>
            <p style={{ fontSize: "0.75rem", color: "#93b4d4" }}>
              Version Check — V1 vs V2 Comparison
            </p>
          </div>
          <div className="ml-auto">
            <span
              className="rounded-full px-3 py-1"
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                background: "rgba(255,255,255,0.15)",
                color: "#ffffff",
              }}
            >
              {uploadedCount}/2 Loaded
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-5 flex-1">

        {/* ── Note Banner ── */}
        <div
          className="rounded-lg px-4 py-3 flex items-start gap-3 border"
          style={{ background: "#FFFBEB", borderColor: "#F59E0B" }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#D97706" }} />
          <p style={{ fontSize: "0.875rem", color: "#92400E" }}>
            <strong>Note:</strong> Upload two versions of the same document side by side, then click{" "}
            <strong>Run Version Check</strong> to compare differences between them.
          </p>
        </div>

        {/* ── Back link ── */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 w-fit transition-opacity hover:opacity-70"
            style={{ fontSize: "0.875rem", color: "#1E3A5F", fontWeight: 500 }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Checklist
          </button>
        )}

        {/* ── Section Title ── */}
        <div className="flex items-center gap-3">
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#1E3A5F" }}>
            Upload Documents for Comparison
          </h2>
          <div className="flex-1 h-px" style={{ background: "#E2E8F0" }} />
        </div>

        {/* ── Two Upload Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {versions.map((ver, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col"
              style={{ borderColor: "#E2E8F0" }}
            >
              {/* Card header */}
              <div
                className="px-5 py-3.5 flex items-center gap-2 border-b"
                style={{ background: ver.bgColor, borderColor: ver.borderColor }}
              >
                <span
                  className="rounded-md px-2.5 py-0.5"
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    background: ver.tagBg,
                    color: ver.tagColor,
                  }}
                >
                  {ver.tag}
                </span>
                <span style={{ fontSize: "0.95rem", fontWeight: 700, color: ver.color }}>
                  {ver.label}
                </span>
                {ver.file && (
                  <span
                    className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ fontSize: "0.68rem", fontWeight: 600, background: "#DCFCE7", color: "#15803D" }}
                  >
                    <CheckCircle2 className="w-3 h-3" /> Loaded
                  </span>
                )}
              </div>

              {/* Card body */}
              <div className="p-5 flex-1 flex flex-col">
                {ver.file ? (
                  /* ── File preview ── */
                  <div className="flex-1 flex flex-col gap-4">
                    <div
                      className="rounded-xl border p-5 flex flex-col items-center gap-3 text-center"
                      style={{ background: ver.bgColor, borderColor: ver.borderColor }}
                    >
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ background: ver.tagBg }}
                      >
                        <FileText className="w-7 h-7" style={{ color: ver.color }} />
                      </div>
                      <div className="w-full">
                        <p
                          className="truncate"
                          style={{ fontSize: "0.875rem", fontWeight: 600, color: ver.color }}
                        >
                          {ver.file.name}
                        </p>
                        <p style={{ fontSize: "0.72rem", color: "#64748B", marginTop: "2px" }}>
                          {(ver.file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(idx)}
                      className="flex items-center justify-center gap-1.5 rounded-lg py-2 border transition-colors hover:bg-red-50"
                      style={{ fontSize: "0.8rem", color: "#DC2626", borderColor: "#FCA5A5" }}
                    >
                      <X className="w-3.5 h-3.5" /> Remove File
                    </button>
                  </div>
                ) : (
                  /* ── Drop zone ── */
                  <div
                    className="flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all"
                    style={{
                      borderColor: dragOverIdx === idx ? ver.color : "#CBD5E1",
                      background: dragOverIdx === idx ? ver.bgColor : "#F8FAFC",
                      minHeight: "200px",
                      padding: "2rem",
                    }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                    onDragLeave={() => setDragOverIdx(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverIdx(null);
                      if (e.dataTransfer.files[0]) handleFile(idx, e.dataTransfer.files[0]);
                    }}
                    onClick={() => fileRefs[idx].current?.click()}
                  >
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{ background: dragOverIdx === idx ? ver.tagBg : "#F1F5F9" }}
                    >
                      <Paperclip
                        className="w-6 h-6"
                        style={{ color: dragOverIdx === idx ? ver.color : "#94A3B8" }}
                      />
                    </div>
                    <div className="text-center">
                      <p style={{ fontSize: "0.875rem", color: "#475569" }}>
                        Drag & drop or{" "}
                        <span style={{ color: ver.color, textDecoration: "underline" }}>browse</span>
                      </p>
                      <p style={{ fontSize: "0.72rem", color: "#94A3B8", marginTop: "4px" }}>
                        ZIP archive (.zip)
                      </p>
                    </div>
                    <input
                      ref={fileRefs[idx]}
                      type="file"
                      accept=".zip"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFile(idx, e.target.files[0]);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Error Message ── */}
        {error && (
          <div
            className="rounded-lg px-4 py-3 flex items-start gap-3 border"
            style={{ background: "#FEF2F2", borderColor: "#FCA5A5" }}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#DC2626" }} />
            <p style={{ fontSize: "0.875rem", color: "#991B1B" }}>
              {error}
            </p>
          </div>
        )}

        {/* ── Run Version Check Button ── */}
        <div className="flex justify-center">
          <button
            onClick={handleRunCheck}
            disabled={!allUploaded || checking}
            className="flex items-center gap-2 rounded-lg px-12 py-3 shadow-md transition-all"
            style={{
              fontSize: "0.9rem",
              fontWeight: 600,
              background: allUploaded && !checking ? "#1E3A5F" : "#E2E8F0",
              color: allUploaded && !checking ? "#ffffff" : "#94A3B8",
              cursor: allUploaded && !checking ? "pointer" : "not-allowed",
              boxShadow: allUploaded && !checking ? undefined : "none",
            }}
          >
            {checking ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing Versions…
              </>
            ) : (
              <>
                <GitCompare className="w-4 h-4" />
                Run Version Check
                {!allUploaded && (
                  <span
                    className="ml-1 rounded-full px-1.5 py-0.5"
                    style={{ fontSize: "0.65rem", fontWeight: 700, background: "#CBD5E1", color: "#64748B" }}
                  >
                    {uploadedCount}/2
                  </span>
                )}
              </>
            )}
          </button>
        </div>

        {/* ── Results Display ── */}
        {results && (
          <div
            className="bg-white rounded-xl shadow-sm border overflow-hidden"
            style={{ borderColor: "#E2E8F0" }}
          >
            {/* Results header */}
            <div
              className="px-5 py-3.5 flex items-center justify-between border-b"
              style={{ background: "#F0F4FA", borderColor: "#E2E8F0" }}
            >
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4" style={{ color: "#1E3A5F" }} />
                <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1E3A5F" }}>
                  Comparison Results — Added Documents
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    background: totalDiffs === 0 ? "#DCFCE7" : "#FEE2E2",
                    color: totalDiffs === 0 ? "#15803D" : "#991B1B",
                    border: `1px solid ${totalDiffs === 0 ? "#86EFAC" : "#FCA5A5"}`
                  }}
                >
                  {totalDiffs === 0 ? (
                    <><CheckCircle2 className="w-3 h-3" /> No Differences</>
                  ) : (
                    <><AlertTriangle className="w-3 h-3" /> {totalDiffs} Differences Found</>
                  )}
                </span>
                <button
                  onClick={() => setShowResults((s) => !s)}
                  className="p-1 rounded hover:bg-slate-200 transition-colors"
                >
                  {showResults
                    ? <ChevronUp className="w-4 h-4" style={{ color: "#64748B" }} />
                    : <ChevronDown className="w-4 h-4" style={{ color: "#64748B" }} />}
                </button>
              </div>
            </div>

            {showResults && (
              <div className="p-6 flex flex-col gap-8">
                {totalDiffs === 0 && (
                  <div className="px-4 py-8 rounded-xl bg-slate-50 border border-slate-200 border-dashed text-center flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#334155" }}>
                      No differences found between these versions.
                    </p>
                    <p style={{ fontSize: "0.8rem", color: "#64748B" }}>
                      All files in both archives match by filename.
                    </p>
                  </div>
                )}

                {/* Section: Only in Zip A */}
                {onlyA.length > 0 && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded px-2 py-0.5"
                        style={{ background: versions[0].tagBg, fontSize: "0.7rem", fontWeight: 700, color: versions[0].tagColor }}
                      >
                        {versions[0].tag}
                      </span>
                      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "#334155" }}>
                        Documents only in {versions[0].file?.name || "Version 1"}
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {onlyA.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border p-4 bg-slate-50 border-slate-200"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-white border border-slate-200">
                              <FileText className="w-5 h-5" style={{ color: versions[0].color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1E3A5F" }}>
                                {item.document_added}
                              </p>
                              <p style={{ fontSize: "0.72rem", color: "#64748B", marginBottom: "8px" }}>
                                Path: {item.path_in_zip}
                              </p>
                              {item.Description && (
                                <div className="mt-2 p-3 rounded-lg bg-white border border-slate-100 shadow-sm">
                                  <p style={{ fontSize: "0.8rem", color: "#475569", lineHeight: "1.5" }}>
                                    <strong style={{ color: "#1E3A5F" }}>Description:</strong> {item.Description}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section: Only in Zip B */}
                {onlyB.length > 0 && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded px-2 py-0.5"
                        style={{ background: versions[1].tagBg, fontSize: "0.7rem", fontWeight: 700, color: versions[1].tagColor }}
                      >
                        {versions[1].tag}
                      </span>
                      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "#334155" }}>
                        Documents only in {versions[1].file?.name || "Version 2"}
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {onlyB.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border p-4 bg-slate-50 border-slate-200"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-white border border-slate-200">
                              <FileText className="w-5 h-5" style={{ color: versions[1].color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1E3A5F" }}>
                                {item.document_added}
                              </p>
                              <p style={{ fontSize: "0.72rem", color: "#64748B", marginBottom: "8px" }}>
                                Path: {item.path_in_zip}
                              </p>
                              {item.Description && (
                                <div className="mt-2 p-3 rounded-lg bg-white border border-slate-100 shadow-sm">
                                  <p style={{ fontSize: "0.8rem", color: "#475569", lineHeight: "1.5" }}>
                                    <strong style={{ color: "#1E3A5F" }}>Description:</strong> {item.Description}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div
                  className="px-5 py-3 -mx-6 -mb-6 border-t flex items-center gap-2"
                  style={{ background: "#F8FAFC", borderColor: "#E2E8F0" }}
                >
                  <Clock className="w-3.5 h-3.5" style={{ color: "#94A3B8" }} />
                  <span style={{ fontSize: "0.75rem", color: "#64748B" }}>
                    Analysis completed — {totalDiffs} document differences detected between 2 versions.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pb-6" />
      </div>
    </div>
  );
}

/* default export for route-based lazy imports */
export default VersionCheck;
