import React from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  FolderOpen,
  ArrowLeft
} from "lucide-react";

export function NavigationScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex flex-col">

      {/* Header */}
      <header className="bg-[#1E3A5F] shadow-md">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <h1 className="text-white text-2xl font-bold">
            Select Submission Type
          </h1>
          <p className="text-blue-200 text-sm mt-2">
            Choose one category to continue
          </p>
        </div>
      </header>

      {/* Page Content */}
      <div className="max-w-6xl mx-auto w-full px-6 py-6">

        {/* Back Button */}
        <button
          onClick={() => navigate("..")}
          className="flex items-center gap-2 text-[#1E3A5F] font-medium hover:text-blue-700 mb-8 transition"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Checklist
        </button>

        {/* Cards */}
        <div className="flex-1 flex items-center justify-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">

            {/* NDA Card */}
            <div
              onClick={() => navigate("../nda")}
              className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all cursor-pointer p-8 border hover:border-blue-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="bg-blue-100 p-4 rounded-full mb-4">
                  <FileText className="w-10 h-10 text-blue-700" />
                </div>
                <h2 className="text-2xl font-bold text-[#1E3A5F] mb-2">
                  NDA
                </h2>
                <p className="text-gray-600 text-sm">
                  New Drug Application
                </p>
              </div>
            </div>

            {/* Generic Card */}
            <div
              onClick={() => navigate("../generic")}
              className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all cursor-pointer p-8 border hover:border-green-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="bg-green-100 p-4 rounded-full mb-4">
                  <FolderOpen className="w-10 h-10 text-green-700" />
                </div>
                <h2 className="text-2xl font-bold text-[#1E3A5F] mb-2">
                  Generic
                </h2>
                <p className="text-gray-600 text-sm">
                  Generic product submission
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}