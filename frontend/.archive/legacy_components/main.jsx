import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { sessionRecorder } from './utils/sessionRecorder';

// Initialize AI Diagnostics & Interaction Telemetry
sessionRecorder.start();

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
