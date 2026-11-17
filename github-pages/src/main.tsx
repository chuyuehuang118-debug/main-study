import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../app/globals.css';
import { StudyApp } from '@/components/study-app';
import { ResearcherDashboard } from '@/components/researcher-dashboard';

function App() {
  const researcher = window.location.hash === '#/researcher';
  return researcher ? <ResearcherDashboard /> : <StudyApp />;
}

window.addEventListener('hashchange', () => window.location.reload());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
