import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ProfessionalProvider } from './store/useProfessional'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProfessionalProvider>
      <App />
    </ProfessionalProvider>
  </StrictMode>,
)
