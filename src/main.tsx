import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './design-system.css'
import './layout.css'
import './visual-polish.css'
import './quality.css'
import './dashboard-harmony.css'
import './auth-refinement.css'
import './sidebar-refresh.css'
import './site-unification.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
