'use client'

import type { ReactNode } from 'react'
import { AuthProvider } from 'lightauth/react'

export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider baseUrl="/api/auth">{children}</AuthProvider>
}
