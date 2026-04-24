import { useState, useRef } from "react";
import type { SubItem } from "../App";
import { api } from "../services/api";
import {
  ArrowLeft,
  Upload,
  RotateCcw,
  Paperclip,
  FileText,
  ShieldCheck,
  UserX,
  FileSearch,
  AlertCircle,
  CheckCircle2,
  X,
  Layers,
} from "lucide-react";

interface UploadScreenProps {
  item: SubItem;
  onBack: () => void;
  onSubmit: (id: string, file: File) => void;
}

type ActionState = "idle" | "processing" | "done";

export function UploadScreen({ item, onBack, onSubmit }: UploadScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [anonymization, setAnonymization] = useState<ActionState>("idle");
  const [pseudoAnonymization, setPseudoAnonymization] = useState<ActionState>("idle");
  const [summarization, setSummarization] = useState<ActionState>("idle");
  const [classification, setClassification] = useState<ActionState>("idle");
  const [analysisResult, setAnalysisResult] = useState<{ status: string; checklist_title: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [summarizationResult, setSummarizationResult] = useState<any>(null);
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileReady = file !== null;

  const triggerAnalysis = async (uploadedFile: File) => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const formData = new FormData();
      formData.append("checklist_title", item.label);
      formData.append("input_file", uploadedFile);

      const result = await api.common.analyzeDocument(formData);
      setAnalysisResult(result as any);
    } catch (err) {
      console.error("Analysis error:", err);
      setError("Failed to analyze document relevance.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const uploadedFile = e.target.files[0];
      setFile(uploadedFile);
      setError("");
      setAnonymization("idle");
      setPseudoAnonymization("idle");
      setSummarization("idle");
      setClassification("idle");
      setSummarizationResult(null);
      setClassificationResult(null);
      triggerAnalysis(uploadedFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const uploadedFile = e.dataTransfer.files[0];
      setFile(uploadedFile);
      setError("");
      setAnonymization("idle");
      setPseudoAnonymization("idle");
      setSummarization("idle");
      setClassification("idle");
      setSummarizationResult(null);
      setClassificationResult(null);
      triggerAnalysis(uploadedFile);
    }
  };

  const handleReset = () => {
    setFile(null);
    setError("");
    setAnonymization("idle");
    setPseudoAnonymization("idle");
    setSummarization("idle");
    setClassification("idle");
    setAnalysisResult(null);
    setSummarizationResult(null);
    setClassificationResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleActionClick = async (
    action: "anonymization" | "pseudo" | "summarization" | "classification"
  ) => {
    if (!fileReady || !file) return;
    // Clear stale errors from previous failed runs.
    setError("");

    const set =
      action === "anonymization"
        ? setAnonymization
        : action === "pseudo"
          ? setPseudoAnonymization
          : action === "summarization"
            ? setSummarization
            : setClassification;

    set("processing");

    try {
      if (action === "anonymization" || action === "pseudo") {
        const mode = action === "anonymization" ? "full" : "pseudo";
        const formData = new FormData();
        formData.append("file", file);

        const blob = await (mode === "full" ? api.anonymisation.uploadDocxFull(formData) : api.anonymisation.uploadDocxPseudo(formData));

        const url = window.URL.createObjectURL(blob as any);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${mode}_anonymized_${file.name}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else if (action === "summarization") {
        const formData = new FormData();
        formData.append("files", file);
        formData.append("task_type", "application_document_summarization");

        const result = await api.summarization.summarize(formData);
        setSummarizationResult(result);
      } else if (action === "classification") {
        const formData = new FormData();
        formData.append("files", file);
        const result = await api.classification.classifyOtherFiles(formData);
        setClassificationResult(result);
      }
      // Ensure old error message does not persist after success.
      setError("");
      set("done");
    } catch (err) {
      console.error(`${action} error:`, err);
      setError(`Failed to perform ${action}.`);
      set("idle");
    }
  };

  const handleSubmit = () => {
    if (!fileReady || !file) {
      setError("Please choose a file before submitting.");
      return;
    }
    onSubmit(item.id, file);
  };

  const isModule5 = item.id.startsWith("5.");

  const allActions = [
    {
      key: "anonymization" as const,
      label: "Anonymization",
      icon: <UserX className="w-4 h-4" />,
      state: anonymization,
      activeColor: "#1D4ED8",
      activeHover: "#1E40AF",
      onClick: () => handleActionClick("anonymization"),
      hidden: !isModule5,
    },
    {
      key: "pseudo" as const,
      label: "Pseudo-Anonymization",
      icon: <ShieldCheck className="w-4 h-4" />,
      state: pseudoAnonymization,
      activeColor: "#7C3AED",
      activeHover: "#6D28D9",
      onClick: () => handleActionClick("pseudo"),
      hidden: !isModule5,
    },
    {
      key: "summarization" as const,
      label: "Summarization",
      icon: <FileSearch className="w-4 h-4" />,
      state: summarization,
      activeColor: "#059669",
      activeHover: "#047857",
      onClick: () => handleActionClick("summarization"),
      hidden: false,
    },
    {
      key: "classification" as const,
      label: "Classification Tool",
      icon: <Layers className="w-4 h-4" />,
      state: classification,
      activeColor: "#CA8A04",
      activeHover: "#A16207",
      onClick: () => handleActionClick("classification"),
      hidden: !isModule5,
    },
  ];

  const actionButtonConfig = allActions.filter((btn) => !btn.hidden);

  const getClassificationNarrative = (classification: any) => {
    const caseNarrative = classification?.case_narrative?.value || classification?.case_narrative;
    if (typeof caseNarrative === "string" && caseNarrative.trim()) {
      return caseNarrative;
    }

    const eventDescription = classification?.event_description?.value || classification?.event_description;
    const outcome = classification?.outcome?.value || classification?.outcome;
    const causality = classification?.causality?.value || classification?.causality;
    const onset = classification?.event_onset?.value || classification?.event_onset;
    const drug = classification?.suspected_drug?.value || classification?.suspected_drug;
    const age = classification?.patient_age?.value || classification?.patient_age;
    const gender = classification?.patient_gender?.value || classification?.patient_gender;

    const composed = [
      eventDescription ? `Event: ${eventDescription}` : "",
      outcome ? `Outcome: ${outcome}` : "",
      causality ? `Causality: ${causality}` : "",
      onset ? `Onset: ${onset}` : "",
      drug ? `Suspected drug: ${drug}` : "",
      age || gender ? `Patient: ${[age, gender].filter(Boolean).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(". ");
    if (composed) {
      return composed;
    }

    const sourceSets = [
      classification?.event_description?.source,
      classification?.outcome?.source,
      classification?.seriousness?.source,
    ];
    for (const sources of sourceSets) {
      if (!Array.isArray(sources)) continue;
      const snippet = sources.find(
        (s: any) =>
          typeof s?.text_snippet === "string" &&
          s.text_snippet.trim() &&
          !s.text_snippet.toLowerCase().includes("rule-based engine output")
      )?.text_snippet;
      if (snippet) return snippet;
    }
    return "No narrative available.";
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
              Upload Document
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4 flex-1">
        {/* Note Banner */}
        <div
          className="rounded-lg px-4 py-3 flex items-start gap-3 border"
          style={{ background: "#FFFBEB", borderColor: "#F59E0B" }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#D97706" }} />
          <p style={{ fontSize: "0.875rem", color: "#92400E" }}>
            <strong>Note:</strong> Please choose a file and click Submit to upload the document.
          </p>
        </div>

        {/* Back link */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 w-fit transition-colors hover:opacity-70"
          style={{ fontSize: "0.875rem", color: "#1E3A5F", fontWeight: 500 }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Checklist
        </button>

        {/* Upload Card */}
        <div
          className="bg-white rounded-xl shadow-sm border overflow-hidden"
          style={{ borderColor: "#E2E8F0" }}
        >
          {/* Card Header */}
          <div
            className="px-6 py-3.5 border-b"
            style={{ background: "#F0F4FA", borderColor: "#E2E8F0" }}
          >
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1E3A5F" }}>
              Upload Certificate
            </span>
          </div>

          {/* Card Body */}
          <div className="px-6 py-6">
            {/* Document label + Drop zone */}
            <div className="flex flex-col sm:flex-row gap-6 mb-6">
              {/* Left: label */}
              <div className="sm:w-56 shrink-0 flex items-start pt-1">
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#334155" }}>
                  <span style={{ color: "#64748B", fontSize: "0.78rem", display: "block", marginBottom: "3px" }}>
                    {item.id}
                  </span>
                  {item.label}
                </p>
              </div>

              {/* Right: drag-drop */}
              <div className="flex-1">
                {file ? (
                  /* File Preview */
                  <div
                    className="rounded-xl border-2 px-4 py-4 flex items-center gap-3"
                    style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "#DCFCE7" }}
                    >
                      <FileText className="w-5 h-5" style={{ color: "#16A34A" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="truncate"
                        style={{ fontSize: "0.875rem", fontWeight: 600, color: "#15803D" }}
                      >
                        {file.name}
                      </p>
                      <p style={{ fontSize: "0.72rem", color: "#4ADE80" }}>
                        {(file.size / 1024).toFixed(1)} KB — Ready to submit
                      </p>
                    </div>
                    <button
                      onClick={handleReset}
                      className="p-1 rounded-full hover:bg-green-200 transition-colors"
                    >
                      <X className="w-4 h-4" style={{ color: "#15803D" }} />
                    </button>
                  </div>
                ) : (
                  /* Drop zone */
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${dragOver ? "scale-[1.01]" : ""
                      }`}
                    style={{
                      borderColor: dragOver ? "#1D4ED8" : "#CBD5E1",
                      background: dragOver ? "#EFF6FF" : "#F8FAFC",
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                      style={{ background: dragOver ? "#DBEAFE" : "#F1F5F9" }}
                    >
                      <Paperclip
                        className="w-6 h-6"
                        style={{ color: dragOver ? "#1D4ED8" : "#94A3B8" }}
                      />
                    </div>
                    <p style={{ fontSize: "0.875rem", color: "#475569", textAlign: "center" }}>
                      Drag & drop a file here, or{" "}
                      <span style={{ color: "#1D4ED8", textDecoration: "underline", cursor: "pointer" }}>
                        browse
                      </span>
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "6px" }}>
                      PDF, DOC, DOCX, JPG, PNG supported
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                )}

                {/* Analysis Result Display */}
                {(isAnalyzing || analysisResult) && (
                  <div className={`mt-4 p-4 rounded-xl border transition-all ${isAnalyzing
                    ? "bg-blue-50 border-blue-200"
                    : (analysisResult?.status?.toLowerCase() === "matched" || analysisResult?.status?.toLowerCase() === "relevant")
                      ? "bg-green-50 border-green-200"
                      : "bg-red-50 border-red-200"
                    }`}>
                    <div className="flex items-center gap-3">
                      {isAnalyzing ? (
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      ) : (analysisResult?.status?.toLowerCase() === "matched" || analysisResult?.status?.toLowerCase() === "relevant") ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <p style={{ fontSize: "0.875rem", fontWeight: 700, color: isAnalyzing ? "#1E40AF" : (analysisResult?.status?.toLowerCase() === "matched" || analysisResult?.status?.toLowerCase() === "relevant") ? "#15803D" : "#B91C1C" }}>
                          {isAnalyzing ? "Analyzing document relevance..." : (analysisResult?.status?.toLowerCase() === "matched" || analysisResult?.status?.toLowerCase() === "relevant") ? "Document Relevant" : "Irrelevant to Field"}
                        </p>
                        {!isAnalyzing && analysisResult && (
                          <p style={{ fontSize: "0.75rem", color: (analysisResult.status?.toLowerCase() === "matched" || analysisResult.status?.toLowerCase() === "relevant") ? "#16A34A" : "#DC2626" }}>
                            {(analysisResult.status?.toLowerCase() === "matched" || analysisResult.status?.toLowerCase() === "relevant")
                              ? `This document is relevant to "${item.label}"`
                              : `This document does not seem to match "${item.label}"`}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Summarization Result Display */}
                {summarizationResult && (
                  <div className="mt-4 p-5 rounded-xl border bg-white shadow-sm border-emerald-100">
                    <div className="flex items-center gap-2 mb-3">
                      <FileSearch className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-sm font-bold text-emerald-900">Document Summary</h3>
                    </div>
                    <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
                      {summarizationResult.overall_summary?.value ? (
                        <div className="bg-emerald-50/50 p-4 rounded-lg text-emerald-900 leading-relaxed">
                          {summarizationResult.overall_summary.value}
                        </div>
                      ) : (
                        <pre className="bg-gray-50 p-3 rounded text-[0.75rem] overflow-auto max-h-60">
                          {JSON.stringify(summarizationResult, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                )}

                {/* Classification Result Display */}
                {classificationResult && (
                  <div className="mt-4 p-5 rounded-xl border bg-white shadow-sm border-amber-100">
                    <div className="flex items-center gap-2 mb-4 border-b border-amber-100 pb-2">
                      <Layers className="w-5 h-5 text-amber-600" />
                      <h3 className="text-sm font-bold text-amber-900">SAE Case Classification</h3>
                    </div>
                    
                    {(!classificationResult?.results || classificationResult.results.length === 0) && !classificationResult?.classification ? (
                      <div className="py-6 text-center">
                        <p className="text-sm text-amber-700 italic">No classification data found in the response.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        {/* Primary Fields */}
                      {[
                        { key: "seriousness", label: "Severity" },
                        { key: "case_id", label: "Case ID" },
                        { key: "suspected_drug", label: "Drug" },
                        { key: "event_description", label: "Adverse Event" },
                        { key: "causality", label: "Causality" },
                        { key: "event_onset", label: "Time to Onset" },
                        { key: "outcome", label: "Outcome" },
                        { key: "patient_age", label: "Patient Age" },
                        { key: "patient_gender", label: "Patient Sex" },
                        { key: "reporter", label: "Reporter" },
                        { key: "report_date", label: "Report Date" },
                      ].map((field) => {
                        // Backend returns results in an array, we take the first one
                        const classification = classificationResult?.results?.[0]?.classification || classificationResult?.classification || classificationResult;
                        const rawValue = classification?.[field.key]?.value ||
                          classification?.[field.key] ||
                          classification?.[field.label];

                        // report_date is often not explicitly provided by backend;
                        // derive a display date from event_onset when possible.
                        const value = field.key === "report_date"
                          ? (
                            rawValue ||
                            classification?.event_onset?.value?.split(" ")?.[0] ||
                            classification?.event_onset?.split?.(" ")?.[0] ||
                            "N/A"
                          )
                          : (rawValue || "N/A");

                        return (
                          <div key={field.key} className="flex flex-col">
                            <span className="text-[0.65rem] font-bold text-amber-600 uppercase tracking-wider mb-0.5">
                              {field.label}
                            </span>
                            <span className="text-sm text-gray-800 font-medium">
                              {value}
                            </span>
                          </div>
                        );
                      })}
                      
                      {/* Full-width fields */}
                      {[
                        { key: "event_description", label: "Case Details" },
                        { key: "case_narrative", label: "Case Narrative" },
                      ].map((field) => {
                        const classification = classificationResult?.results?.[0]?.classification || classificationResult?.classification || classificationResult;
                        const value = field.key === "case_narrative"
                          ? getClassificationNarrative(classification)
                          : classification?.[field.key]?.value || 
                            classification?.[field.key] || 
                            classification?.[field.label] ||
                            "N/A";

                        return (
                          <div key={field.key} className="sm:col-span-2 flex flex-col bg-amber-50/30 p-3 rounded-lg border border-amber-50">
                            <span className="text-[0.65rem] font-bold text-amber-600 uppercase tracking-wider mb-1">
                              {field.label}
                            </span>
                            <p className="text-sm text-gray-700 leading-relaxed">
                              {value}
                            </p>
                          </div>
                        );
                      })}
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <p
                    className="mt-2 flex items-center gap-1"
                    style={{ fontSize: "0.8rem", color: "#DC2626" }}
                  >
                    <AlertCircle className="w-3.5 h-3.5" /> {error}
                  </p>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t mb-5" style={{ borderColor: "#F1F5F9" }} />

            {/* AI Action Buttons */}
            <div className="mb-6">
              <p
                className="mb-3"
                style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}
              >
                AI Processing Actions
              </p>
              <div className="flex flex-wrap gap-3">
                {actionButtonConfig.map((btn) => {
                  const isDisabled = !fileReady;
                  const isDone = btn.state === "done";
                  const isProcessing = btn.state === "processing";

                  return (
                    <button
                      key={btn.key}
                      onClick={btn.onClick}
                      disabled={isDisabled || isProcessing}
                      className="flex items-center gap-2 rounded-lg px-4 py-2.5 transition-all font-medium"
                      style={{
                        fontSize: "0.82rem",
                        cursor: isDisabled ? "not-allowed" : "pointer",
                        background: isDisabled
                          ? "#E2E8F0"
                          : isDone
                            ? "#DCFCE7"
                            : btn.activeColor,
                        color: isDisabled
                          ? "#94A3B8"
                          : isDone
                            ? "#15803D"
                            : "#FFFFFF",
                        border: isDone ? "1px solid #86EFAC" : "none",
                        opacity: isProcessing ? 0.7 : 1,
                        boxShadow: isDisabled ? "none" : isDone ? "none" : "0 2px 6px rgba(0,0,0,0.15)",
                      }}
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : isProcessing ? (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        btn.icon
                      )}
                      {isProcessing ? "Processing…" : isDone ? `${btn.label} Done` : btn.label}
                    </button>
                  );
                })}
              </div>
              {!fileReady && (
                <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "8px" }}>
                  Upload a file above to enable AI processing actions.
                </p>
              )}
            </div>

            {/* Submit / Reset */}
            <div className="flex justify-center gap-3">
              <button
                onClick={handleSubmit}
                className="flex items-center gap-2 rounded-lg px-7 py-2.5 shadow-md transition-all hover:opacity-90"
                style={{ background: "#1E3A5F", color: "#ffffff", fontSize: "0.875rem", fontWeight: 600 }}
              >
                <Upload className="w-4 h-4" />
                Submit
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 rounded-lg px-7 py-2.5 shadow-md transition-all hover:opacity-90"
                style={{ background: "#2E7D32", color: "#ffffff", fontSize: "0.875rem", fontWeight: 600 }}
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
