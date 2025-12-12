import './globals.css'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'LightAuth Next.js Example',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
