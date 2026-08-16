import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './index.css';
import './p05.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('DiffLens root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
