import type { Metadata } from 'next'
import '../styles/globals.css'
import { metadata as sharedMetadata } from './metadata'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = sharedMetadata

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="App">
        <Navbar />
        <main>
          {children}
        </main>
      </body>
    </html>
  )
}
