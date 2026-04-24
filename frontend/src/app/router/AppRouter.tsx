import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from '../../pages/LandingPage';
import SugamPortalPage from '../../pages/SugamPortalPage';
import WorkspacePage from '../../pages/WorkspacePage';
import AnonymisationPage from '../../pages/AnonymisationPage';
import CompletenessPage from '../../pages/CompletenessPage';
import CompletenessCheckPage from '../../pages/CompletenessCheckPage';
import ConsistencyCheckPage from '../../pages/ConsistencyCheckPage';
import ConsistencyCheckResultsPage from '../../pages/ConsistencyCheckResultsPage';
import VersionsCheckPage from '../../pages/VersionsCheckPage';
import ClassificationPage from '../../pages/ClassificationPage';
import SummarisationPage from '../../pages/SummarisationPage';
import SummarizeOtherFilesPage from '../../pages/SummarizeOtherFilesPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function AppRouter() {

  return (
    <Routes>

      {/* Landing page — initial entry point */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/eCTD-module" element={<LandingPage />} />
      <Route path="/sugam/*" element={<SugamPortalPage />} />

      {/* Main workspace — file tree + feature panel */}
      <Route path="/workspace" element={<PrivateRoute><WorkspacePage /></PrivateRoute>} />

      {/* Full 3-panel dedicated pages (opened from workspace with results state) */}
      <Route path="/anonymisation" element={<PrivateRoute><AnonymisationPage /></PrivateRoute>} />
      <Route path="/anonymisation/upload" element={<PrivateRoute><AnonymisationPage /></PrivateRoute>} />
      <Route path="/anonymisation/results" element={<PrivateRoute><AnonymisationPage /></PrivateRoute>} />
      
      <Route path="/classification" element={<PrivateRoute><ClassificationPage /></PrivateRoute>} />
      <Route path="/classification/upload" element={<PrivateRoute><ClassificationPage /></PrivateRoute>} />
      <Route path="/classification/results" element={<PrivateRoute><ClassificationPage /></PrivateRoute>} />
      
      <Route path="/summarisation" element={<PrivateRoute><SummarisationPage /></PrivateRoute>} />
      <Route path="/summarisation/upload" element={<PrivateRoute><SummarisationPage /></PrivateRoute>} />
      <Route path="/summarisation/results" element={<PrivateRoute><SummarisationPage /></PrivateRoute>} />
      <Route path="/summarize-other-files" element={<PrivateRoute><SummarizeOtherFilesPage /></PrivateRoute>} />
      
     
      <Route path="/completeness" element={<PrivateRoute><CompletenessPage /></PrivateRoute>} />
      <Route path="/completeness/upload" element={<PrivateRoute><CompletenessPage /></PrivateRoute>} />
      <Route path="/completeness/results" element={<PrivateRoute><CompletenessPage /></PrivateRoute>} />
      
      <Route path="/completeness-check" element={<PrivateRoute><CompletenessCheckPage /></PrivateRoute>} />
      <Route path="/completeness-check/upload" element={<PrivateRoute><CompletenessCheckPage /></PrivateRoute>} />
      <Route path="/completeness-check/results" element={<PrivateRoute><CompletenessCheckPage /></PrivateRoute>} />
      
      <Route path="/consistency-check" element={<PrivateRoute><ConsistencyCheckPage /></PrivateRoute>} />
      <Route path="/consistency-check/upload" element={<PrivateRoute><ConsistencyCheckPage /></PrivateRoute>} />
      <Route path="/consistency-check/results" element={<PrivateRoute><ConsistencyCheckPage /></PrivateRoute>} />
      <Route path="/consistency-check-results" element={<PrivateRoute><ConsistencyCheckResultsPage /></PrivateRoute>} />
      
      <Route path="/versions-check" element={<PrivateRoute><VersionsCheckPage /></PrivateRoute>} />
      <Route path="/versions-check/upload" element={<PrivateRoute><VersionsCheckPage /></PrivateRoute>} />
      <Route path="/versions-check/results" element={<PrivateRoute><VersionsCheckPage /></PrivateRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
