import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { CatalogProvider } from './catalog';
import { StoreProvider } from './store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CatalogProvider>
        <StoreProvider>
          <App />
        </StoreProvider>
      </CatalogProvider>
    </BrowserRouter>
  </StrictMode>,
);
