import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/700.css';
import '@fontsource/noto-sans-tamil/400.css';
import '@fontsource/noto-sans-tamil/700.css';
import './App.css';
import App from './App.jsx';

// No StrictMode: the speech engine is a long-lived singleton with browser side effects.
createRoot(document.getElementById('root')).render(<App />);
