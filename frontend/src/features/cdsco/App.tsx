import { useState } from "react";
import { ChecklistScreen } from "./components/ChecklistScreen";
import { UploadScreen } from "./components/UploadScreen";
import { VersionCheck } from "./components/VersionCheck";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { NavigationScreen } from "./components/nda-genric/navigation-screen";
import { NdaPage } from "./components/nda-genric/nda-page";
import { GenericPage } from "./components/nda-genric/generic-page";

export interface SubItem {
  id: string;
  label: string;
  submitted: boolean;
}

export interface Module {
  id: string;
  title: string;
  items: SubItem[];
}

const initialModules: Module[] = [
  {
    id: "m1",
    title: "1. Administrative / Legal Information",
    items: [
      { id: "1.1", label: "Comprehensive Table of Contents", submitted: false },
      { id: "1.2", label: "Application Form", submitted: false },
      { id: "1.3.1", label: "Summary of Product Characteristics (SmPC)", submitted: false },
      { id: "1.3.2", label: "Labeling", submitted: false },
      { id: "1.3.3", label: "Package Leaflet", submitted: false },
      { id: "1.4", label: "Information about the Experts", submitted: false },
      { id: "1.6", label: "Environmental Risk Assessment", submitted: false },
    ],
  },
  {
    id: "m2",
    title: "2. Summaries",
    items: [
      { id: "2.3.1", label: "Quality Overall Summary (QOS) — Drug Substance", submitted: false },
      { id: "2.3.2", label: "Quality Overall Summary (QOS) — Drug Product", submitted: false },
      { id: "2.4", label: "Nonclinical Overview", submitted: false },
      { id: "2.5", label: "Clinical Overview", submitted: false },
      { id: "2.6", label: "Nonclinical Written and Tabulated Summaries", submitted: false },
      { id: "2.7", label: "Clinical Summary", submitted: false },
    ],
  },
  {
    id: "m3",
    title: "3. Quality",
    items: [
      { id: "3.2.S", label: "Drug Substance", submitted: false },
      { id: "3.2.P", label: "Drug Product", submitted: false },
      { id: "3.2.A", label: "Appendices", submitted: false },
      { id: "3.3", label: "Literature References", submitted: false },
    ],
  },
  {
    id: "m4",
    title: "4. Nonclinical Study Reports",
    items: [
      { id: "4.2.1", label: "Pharmacology Study Reports", submitted: false },
      { id: "4.2.2", label: "Pharmacokinetics Study Reports", submitted: false },
      { id: "4.2.3", label: "Toxicology Study Reports", submitted: false },
      { id: "4.3", label: "Literature References", submitted: false },
    ],
  },
  {
    id: "m5",
    title: "5. Clinical Study Reports",
    items: [
      { id: "5.2", label: "Tabular Listing of All Clinical Studies", submitted: false },
      { id: "5.3.1", label: "Reports of Biopharmaceutic Studies", submitted: false },
      { id: "5.3.3", label: "Reports of Human Pharmacokinetic Studies", submitted: false },
      { id: "5.3.5", label: "Reports of Efficacy and Safety Studies", submitted: false },
      { id: "5.4", label: "Literature References", submitted: false },
    ],
  },
];

export default function App() {
  const [modules, setModules] = useState<Module[]>(initialModules);
  const [selectedItem, setSelectedItem] = useState<SubItem | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File>>({});
  const navigate = useNavigate();

  const handleItemClick = (item: SubItem) => {
    setSelectedItem(item);
    navigate("/sugam/upload");
  };

  const handleBack = () => {
    setSelectedItem(null);
    navigate("/sugam/check-list");
  };

  const handleVersionCheck = () => {
    navigate("/sugam/version-check");
  };

  const handleSubmitDocument = (id: string, file: File) => {
    setModules((prev) =>
      prev.map((mod) => ({
        ...mod,
        items: mod.items.map((it) =>
          it.id === id ? { ...it, submitted: true } : it
        ),
      }))
    );
    setUploadedFiles((prev) => ({
      ...prev,
      [id]: file,
    }));
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setSelectedItem(null);
    navigate("/sugam/check-list");
  };

  const handleCheckToggle = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFinalSubmit = () => {
    alert("All selected documents submitted successfully!");
  };

  return (
    <Routes>
      <Route index element={<Navigate to="check-list" replace />} />
      <Route
        path="check-list"
        element={
          <ChecklistScreen
            modules={modules}
            checkedIds={checkedIds}
            uploadedFiles={uploadedFiles}
            onItemClick={handleItemClick}
            onCheckToggle={handleCheckToggle}
            onFinalSubmit={handleFinalSubmit}
            onVersionCheck={handleVersionCheck}
          />
        }
      />

      <Route
        path="navigation"
        element={<NavigationScreen />}
      />

      <Route
        path="version-check"
        element={<VersionCheck onBack={handleBack} />}
      />

      <Route
        path="upload"
        element={
          selectedItem ? (
            <UploadScreen
              item={selectedItem}
              onBack={handleBack}
              onSubmit={handleSubmitDocument}
            />
          ) : (
            <ChecklistScreen
              modules={modules}
              checkedIds={checkedIds}
              uploadedFiles={uploadedFiles}
              onItemClick={handleItemClick}
              onCheckToggle={handleCheckToggle}
              onFinalSubmit={handleFinalSubmit}
              onVersionCheck={handleVersionCheck}
            />
          )
        }
      />
      <Route path="nda" element={<NdaPage />} />
      <Route path="generic" element={<GenericPage />} />
    </Routes>
  );
}
