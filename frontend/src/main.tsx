import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled locally rather than via CDN: no network dependency at demo time.
import 'leaflet/dist/leaflet.css'
import './styles/components.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
