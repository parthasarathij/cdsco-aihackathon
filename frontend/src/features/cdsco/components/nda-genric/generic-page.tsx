import React, { useState } from "react";
import { api } from "../../services/api";
import { ArrowLeft, UploadCloud, FolderOpen, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function GenericPage() {
    const navigate = useNavigate();
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ "drug name": string; "checks": string; "missing": string[] } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
            setError(null);
        }
    };

    const handleCheck = async () => {
        if (!file) {
            setError("Please select a document file first.");
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const data = await api.common.checkSpecifications(formData);
            setResult((data as any).analysis);
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F4F6F9] flex flex-col">

            {/* Header */}
            <header className="bg-[#1E3A5F] shadow-md">
                <div className="max-w-6xl mx-auto px-6 py-5">
                    <h1 className="text-white text-2xl font-bold">
                        Generic Document Processing
                    </h1>
                    <p className="text-blue-200 text-sm mt-1">
                        Upload and manage Generic submission files
                    </p>
                </div>
            </header>

            {/* Main Content */}
            <div className="max-w-5xl mx-auto w-full px-6 py-6">

                {/* Back Button */}
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-[#1E3A5F] font-medium hover:text-blue-700 mb-6 transition"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Back to Navigation
                </button>

                {/* Upload Card */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">

                    {/* Card Header */}
                    <div className="bg-[#F8FAFC] border-b px-8 py-5">
                        <h2 className="text-xl font-bold text-[#1E3A5F] flex items-center gap-3">
                            <FolderOpen className="w-6 h-6 text-green-700" />
                            Generic File Upload
                        </h2>
                    </div>

                    {/* Card Body */}
                    <div className="p-8">

                        {/* Upload Drop Area */}
                        <div className={`border-2 border-dashed rounded-2xl transition cursor-pointer max-w-3xl h-64 mx-auto ${file ? 'border-green-300 bg-green-50' : 'border-blue-200 bg-blue-50 hover:bg-blue-100'}`}>

                            <label
                                htmlFor="genericFileInput"
                                className="flex flex-col items-center justify-center h-full cursor-pointer w-full px-8 py-10"
                            >
                                <div className={`p-4 rounded-full mb-4 ${file ? 'bg-green-100' : 'bg-blue-100'}`}>
                                    <UploadCloud className={`w-10 h-10 ${file ? 'text-green-700' : 'text-blue-700'}`} />
                                </div>

                                <p className="text-lg font-medium text-gray-700 mb-2">
                                    {file ? file.name : "Drag & Drop Generic File Here"}
                                </p>

                                <p className="text-sm text-gray-500 mb-4">
                                    {file ? "File selected successfully" : "Click anywhere in this box to browse files"}
                                </p>

                                <span className={`${file ? 'text-green-700' : 'text-blue-700'} font-medium underline`}>
                                    {file ? "Change File" : "Browse File"}
                                </span>
                            </label>

                            {/* Hidden File Input */}
                            <input
                                id="genericFileInput"
                                type="file"
                                className="hidden"
                                accept=".pdf,.doc,.docx,.txt"
                                onChange={handleFileChange}
                            />
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="mt-6 max-w-3xl mx-auto p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700">
                                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                                <p className="text-sm font-medium">{error}</p>
                            </div>
                        )}

                        {/* Result Display */}
                        {result && (
                            <div className="mt-8 max-w-3xl mx-auto p-6 bg-white border border-gray-200 rounded-2xl shadow-sm">
                                <h3 className="text-lg font-bold text-[#1E3A5F] mb-4 flex items-center gap-2">
                                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                                    Specification Analysis Result
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Drug Name</label>
                                        <p className="text-lg font-medium text-gray-800">{result["drug name"]}</p>
                                    </div>
                                    <div className="pt-2 border-t border-gray-100">
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Universal Checks</label>
                                        <p className={`text-base font-bold mt-1 p-3 rounded-lg ${result.checks === "passed" ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
                                            {result.checks.toUpperCase()}
                                        </p>
                                    </div>
                                    {result.missing && result.missing.length > 0 && (
                                        <div className="pt-2 border-t border-gray-100">
                                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-red-600">Missing Criteria</label>
                                            <ul className="mt-2 list-disc list-inside text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">
                                                {result.missing.map((item, index) => (
                                                    <li key={index} className="font-medium">{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Bottom Action Button */}
                        <div className="mt-8 flex justify-end">
                            <button
                                onClick={handleCheck}
                                disabled={loading || !file}
                                className={`px-10 py-3 rounded-lg shadow-md transition-all flex items-center gap-2 ${loading || !file ? 'bg-gray-400 cursor-not-allowed' : 'hover:shadow-lg active:scale-95'}`}
                                style={{
                                    background: loading || !file ? undefined : "#0F766E",
                                    color: "#ffffff",
                                    fontWeight: 600,
                                    fontSize: "0.95rem",
                                }}
                            >
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                {loading ? "Analyzing..." : "Check"}
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}