import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './index.css';
import App from './App.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';

// Expose KaTeX globally for Markmap and dynamic LaTeX plugin rendering
if (typeof window !== 'undefined') {
  window.katex = katex;
}



createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
