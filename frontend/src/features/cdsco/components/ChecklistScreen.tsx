import { useState } from "react";
import type { Module, SubItem } from "../App";
import { api } from "../services/api";
import { ChevronDown, ChevronRight, FileText, Upload, CheckCircle2, AlertCircle, GitBranch, GitCompare, Loader2, Check, XCircle, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";


interface ChecklistScreenProps {
  modules: Module[];
  checkedIds: Set<string>;
  uploadedFiles: Record<string, File>;
  onItemClick: (item: SubItem) => void;
  onCheckToggle: (id: string) => void;
  onFinalSubmit: () => void;
  onVersionCheck: () => void;
}

type ConsistencyRow = {
  fieldName: string;
  result: "CONSISTENT" | "NEEDS_REVIEW" | "INCONSISTENT";
  notes: string;
  canonicalGroup?: string;
};

function normalizeConsistencyRows(payload: any): ConsistencyRow[] {
  if (Array.isArray(payload?.comparisons)) return payload.comparisons;

  const modules = payload?.modules;
  if (!modules || typeof modules !== "object") return [];

  const rows: ConsistencyRow[] = [];
  Object.entries(modules).forEach(([moduleKey, moduleData]: [string, any]) => {
    const items = Array.isArray(moduleData?.items) ? moduleData.items : [];
    items.forEach((item: any) => {
      const status = String(item?.status || "").toLowerCase();
      const result =
        status === "matched"
          ? "CONSISTENT"
          : status === "needs_user_confirmation"
            ? "NEEDS_REVIEW"
            : "INCONSISTENT";

      const section = item?.checklist_section_id ? `${item.checklist_section_id} ` : "";
      const title = item?.checklist_title || "Checklist Item";
      const matchedFile = item?.matched_file ? `Matched file: ${item.matched_file}` : "No matching file found";
      const applicability = item?.applicability ? `Applicability: ${item.applicability}` : "";
      const score = typeof item?.score === "number" ? `Score: ${item.score.toFixed(2)}` : "";

      rows.push({
        fieldName: `${section}${title}`,
        result,
        notes: [matchedFile, applicability, score].filter(Boolean).join(" | "),
        canonicalGroup: moduleKey.toUpperCase(),
      });
    });
  });

  return rows;
}

export function ChecklistScreen({
  modules,
  checkedIds,
  uploadedFiles,
  onItemClick,
  onCheckToggle,
  onVersionCheck,
}: ChecklistScreenProps) {

  const navigate = useNavigate();
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const [consistencyResults, setConsistencyResults] = useState<any>(null);
  const [expandedResultModules, setExpandedResultModules] = useState<Set<string>>(new Set());

  const comparisonRows = normalizeConsistencyRows(consistencyResults);
  const groupedComparisonRows = comparisonRows.reduce<Record<string, ConsistencyRow[]>>((acc, row) => {
    const key = row.canonicalGroup || "UNSPECIFIED";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const toggleResultModule = (moduleKey: string) => {
    setExpandedResultModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleKey)) next.delete(moduleKey);
      else next.add(moduleKey);
      return next;
    });
  };

  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set(modules.map((m) => m.id))
  );

  const toggleModule = (id: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };


  const totalItems = modules.reduce((acc, m) => acc + m.items.length, 0);
  const submittedItems = modules.reduce(
    (acc, m) => acc + m.items.filter((it) => it.submitted).length,
    0
  );

  const handleConsistencyCheck = async () => {
    setIsCheckingConsistency(true);
    setConsistencyResults(null);

    try {
      const zip = new JSZip();

      // Group files by module folder
      modules.forEach((mod) => {
        const folderName = mod.id.toUpperCase(); // m1 -> M1
        const folder = zip.folder(folderName);

        mod.items.forEach((item) => {
          const file = uploadedFiles[item.id];
          if (file) {
            folder?.file(file.name, file);
          }
        });
      });

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const formData = new FormData();
      formData.append("zip_file", zipBlob, "dossier.zip");

      const results = await api.common.consistencyCheckUpload(formData);
      setConsistencyResults(results);
      const normalized = normalizeConsistencyRows(results);
      const modulesToExpand = new Set(
        normalized.map((row) => row.canonicalGroup || "UNSPECIFIED")
      );
      setExpandedResultModules(modulesToExpand);
    } catch (error) {
      console.error("Error during consistency check:", error);
      alert("Failed to run consistency check. Please ensure all files are correctly uploaded.");
    } finally {
      setIsCheckingConsistency(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F0F2F5" }}>
      {/* Header */}
      <header style={{ background: "#1E3A5F" }} className="shadow-lg">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.1)" }}>
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white" style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "0.01em" }}>
              Document Submission Portal
            </h1>
            <p style={{ fontSize: "0.75rem", color: "#93b4d4" }}>
              Clinical Trial Document Checklist
            </p>
          </div>
          {/* Progress indicator */}
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p style={{ fontSize: "0.7rem", color: "#93b4d4" }}>Progress</p>
              <p style={{ fontSize: "0.85rem", color: "#ffffff", fontWeight: 600 }}>
                {submittedItems} / {totalItems} Uploaded
              </p>
            </div>
            <div className="w-12 h-12 relative flex items-center justify-center">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15" fill="none"
                  stroke="#4ade80" strokeWidth="3"
                  strokeDasharray={`${totalItems > 0 ? (submittedItems / totalItems) * 94.2 : 0} 94.2`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-white" style={{ fontSize: "0.6rem", fontWeight: 700 }}>
                {totalItems > 0 ? Math.round((submittedItems / totalItems) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4 flex-1">
        {/* Note Banner */}
        {!consistencyResults && (
          <div
            className="rounded-lg px-4 py-3 flex items-start gap-3 border"
            style={{ background: "#FFFBEB", borderColor: "#F59E0B" }}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#D97706" }} />
            <p style={{ fontSize: "0.875rem", color: "#92400E" }}>
              <strong>Note:</strong> Please click on each document item or the{" "}
              <strong style={{ color: "#E07B39" }}>Pending</strong> badge to upload the required file.
            </p>
          </div>
        )}

        {/* Consistency Results Section */}
        {consistencyResults && (
          <div className="bg-white rounded-xl shadow-lg border border-blue-100 overflow-hidden mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitBranch className="w-5 h-5 text-blue-700" />
                <h2 className="text-[#1E3A5F] font-bold text-lg">Cross-Module Consistency Report</h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setConsistencyResults(null)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Back to Checklist
                </button>
                <button
                  onClick={() => setConsistencyResults(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 space-y-3 bg-slate-50/60">
              {comparisonRows.length === 0 && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                  Consistency check completed, but no comparable rows were returned by backend.
                </div>
              )}
              {Object.entries(groupedComparisonRows)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([moduleKey, rows]) => {
                  const isOpen = expandedResultModules.has(moduleKey);
                  const consistentCount = rows.filter((r) => r.result === "CONSISTENT").length;
                  return (
                    <div key={moduleKey} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                      <button
                        onClick={() => toggleResultModule(moduleKey)}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="text-slate-500">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </span>
                        <span className="text-sm font-bold text-slate-700">{moduleKey}</span>
                        <span className="ml-auto text-xs font-semibold text-slate-500">
                          {consistentCount}/{rows.length} consistent
                        </span>
                      </button>
                      {isOpen && (
                        <div className="overflow-x-auto border-t border-slate-100">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Field Name</th>
                                <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Result</th>
                                <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {rows.map((res, idx) => (
                                <tr key={`${moduleKey}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3">
                                    <p className="font-semibold text-slate-700 text-sm">{res.fieldName}</p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${res.result === 'CONSISTENT' ? 'bg-green-100 text-green-700' :
                                      res.result === 'NEEDS_REVIEW' ? 'bg-amber-100 text-amber-700' :
                                        'bg-red-100 text-red-700'
                                      }`}>
                                      {res.result === 'CONSISTENT' ? <Check className="w-3 h-3" /> :
                                        res.result === 'NEEDS_REVIEW' ? <Info className="w-3 h-3" /> :
                                          <AlertCircle className="w-3 h-3" />}
                                      {res.result}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="text-sm text-slate-600">{res.notes}</p>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {!consistencyResults && (
          <>
            {/* Accordion List */}
            <div className="flex flex-col gap-3">
              {modules.map((mod) => {
                const isExpanded = expandedModules.has(mod.id);
                const uploadedCount = mod.items.filter((it) => it.submitted).length;

                return (
                  <div
                    key={mod.id}
                    className="rounded-xl overflow-hidden shadow-sm border"
                    style={{ borderColor: "#E2E8F0" }}
                  >
                    {/* Section Header / Accordion Toggle */}
                    <button
                      onClick={() => toggleModule(mod.id)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 transition-colors text-left"
                      style={{ background: "#1E3A5F" }}
                    >
                      <span className="text-white opacity-70">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </span>
                      <span className="text-white flex-1" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                        {mod.title}
                      </span>
                      <span
                        className="rounded-full px-2.5 py-0.5 shrink-0"
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          background: uploadedCount === mod.items.length ? "#22c55e" : "rgba(255,255,255,0.15)",
                          color: "#ffffff",
                        }}
                      >
                        {uploadedCount}/{mod.items.length}
                      </span>
                    </button>

                    {/* Child Items */}
                    {isExpanded && (
                      <div className="bg-white">
                        {/* Column Headers */}
                        <div
                          className="grid px-5 py-2 border-b"
                          style={{
                            gridTemplateColumns: "40px 1fr 130px",
                            background: "#F8FAFC",
                            borderColor: "#E2E8F0",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: "#64748B",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          <span className="text-center">Select</span>
                          <span> Document Name</span>
                          <span className="text-center">Status</span>
                        </div>

                        {mod.items.map((item, idx) => {
                          const isChecked = checkedIds.has(item.id);
                          const isLast = idx === mod.items.length - 1;
                          return (
                            <div
                              key={item.id}
                              className={`grid items-center px-5 py-3 transition-colors hover:bg-slate-50 ${!isLast ? "border-b" : ""}`}
                              style={{
                                gridTemplateColumns: "40px 1fr 130px",
                                borderColor: "#F1F5F9",
                              }}
                            >
                              {/* Checkbox */}
                              <div className="flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => onCheckToggle(item.id)}
                                  className="w-4 h-4 cursor-pointer rounded"
                                  style={{ accentColor: "#1E3A5F" }}
                                />
                              </div>

                              {/* Item label */}
                              <div className="pr-3">
                                <button
                                  onClick={() => onItemClick(item)}
                                  className="text-left hover:underline transition-colors"
                                  style={{ fontSize: "0.875rem", color: "#1D4ED8" }}
                                >
                                  <span style={{ color: "#64748B", marginRight: "6px", fontSize: "0.8rem" }}>
                                    {item.id}.
                                  </span>
                                  {item.label}
                                </button>
                              </div>

                              {/* Status badge */}
                              <div className="flex justify-center">
                                {item.submitted ? (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
                                    style={{
                                      fontSize: "0.72rem",
                                      fontWeight: 600,
                                      background: "#DCFCE7",
                                      color: "#15803D",
                                      border: "1px solid #86EFAC",
                                    }}
                                  >
                                    <CheckCircle2 className="w-3 h-3" /> Uploaded
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => onItemClick(item)}
                                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-all hover:scale-105"
                                    style={{
                                      fontSize: "0.72rem",
                                      fontWeight: 600,
                                      background: "#FFF7ED",
                                      color: "#E07B39",
                                      border: "1px solid #FDBA74",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <Upload className="w-3 h-3" /> Pending
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Submit, Version Check & Consistency Buttons */}
            <div className="flex justify-center items-center gap-4 mt-4 pb-8">
          

              <button
                onClick={onVersionCheck}
                className="flex items-center gap-2 rounded-lg px-8 py-3 shadow-md transition-all hover:shadow-lg hover:opacity-90"
                style={{ background: "#7C3AED", color: "#ffffff", fontSize: "0.9rem", fontWeight: 600 }}
              >
                <GitCompare className="w-4 h-4" />
                Version Check
              </button>

              <button
                onClick={handleConsistencyCheck}
                disabled={submittedItems < totalItems || isCheckingConsistency}
                className="flex items-center gap-2 rounded-lg px-8 py-3 shadow-sm transition-all relative overflow-hidden group"
                style={{
                  background: submittedItems === totalItems ? "#1E3A5F" : "#E2E8F7",
                  color: submittedItems === totalItems ? "#ffffff" : "#94A3B8",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: (submittedItems === totalItems && !isCheckingConsistency) ? "pointer" : "not-allowed",
                  border: submittedItems === totalItems ? "none" : "1px solid #CBD5E1"
                }}
              >
                {isCheckingConsistency ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <GitBranch className="w-4 h-4" />
                )}
                {isCheckingConsistency ? "Checking..." : "Consistency"}
                <span
                  className="ml-2 rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold"
                  style={{
                    background: submittedItems === totalItems ? "rgba(255,255,255,0.2)" : "#CBD5E1",
                    color: submittedItems === totalItems ? "#ffffff" : "#475569"
                  }}
                >
                  {submittedItems}/{totalItems}
                </span>
              </button>

              {/* New Navigation Button */}
              <button
                onClick={() => navigate("/sugam/navigation")}
                className="flex items-center gap-2 rounded-lg px-8 py-3 shadow-md transition-all hover:shadow-lg hover:opacity-90"
                style={{
                  background: "#0F766E",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  fontWeight: 600
                }}
              >
                Pre-Check
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
