# CDSCO Dossier Processing Frontend

## Overview
This folder contains the frontend application for the CDSCO (Central Drugs Standard Control Organization) Dossier Processing system. It is a modern, responsive web application built with React and Vite, providing an intuitive interface for regulatory document management and analysis.

## Purpose and Responsibilities
The frontend application serves as the primary user interface for:
- **Workspace Management:** Uploading, organizing, and navigating through drug dossiers.
- **Analysis Visualization:** Displaying results from backend processes like document classification, summarization, and anonymization.
- **Document Viewing:** Integrated viewers for PDF and DOCX files, allowing users to review content directly in the browser.
- **Real-time Feedback:** Providing progress updates and interactive results for long-running dossier checks.
- **Consistency Checks:** Comparing different versions of dossiers and validating them against regulatory requirements.

## Folder Structure
- **`src/`**: Main application source code.
  - `components/`: Reusable UI components.
    - `features/`: Logic and components specific to application features (Anonymisation, Classification, etc.).
    - `layout/`: Core layout components (Shell, Panels, TopBar).
    - `viewer/`: Specialized document viewing components.
  - `features/`: Feature-based state management, API clients, and page definitions.
  - `pages/`: Top-level page components and routing.
  - `api/`: Centralized API client definitions for backend communication.
  - `hooks/`: Custom React hooks for shared logic.
  - `contexts/`: React context providers for global state (e.g., Auth, Workspace).
- **`public/`**: Static assets like icons and logos.

## Technologies Used
- **Core Framework:** [React 19](https://react.dev/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/), [PostCSS](https://postcss.org/)
- **Routing:** [React Router 7](https://reactrouter.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Document Rendering:** [react-pdf](https://github.com/wojtekmaj/react-pdf), [docx-preview](https://github.com/VolodymyrBaydalka/docxjs)
- **Utilities:** [JSZip](https://stuk.github.io/jszip/)

## Setup and Installation
1. **Navigate to the Frontend Directory:**
   ```bash
   cd frontend
   ```
2. **Install Dependencies:**
   ```bash
   npm install
   ```

## How to Run
### Development Mode
To start the development server with hot-module replacement (HMR):
```bash
npm start
```
The application will be available at `http://localhost:5173` (or the port specified in your terminal).

### Production Build
To create an optimized production build:
```bash
npm run build
```
The output will be in the `dist/` directory.

### Preview Production Build
To preview the generated production build locally:
```bash
npm run preview
```

## Important Notes & Best Practices
- **Backend Connection:** Ensure the Backend server is running (usually at `http://127.0.0.1:8000`) for the frontend to fetch data and perform analyses.
- **Responsive Design:** The application uses a custom `ResponsiveShell` and `DraggableDivider` to support various screen sizes and user preferences.
- **Component Pattern:** Follow the established pattern of separating feature-specific components into the `components/features/` directory.
- **Type Safety:** Maintain strict TypeScript typing for all API responses and component props to ensure application stability.
