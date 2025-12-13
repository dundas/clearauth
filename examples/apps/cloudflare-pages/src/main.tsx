import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AuthProvider } from 'clearauth/react'

import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider baseUrl="/api/auth">
      <App />
    </AuthProvider>
  </StrictMode>
)
