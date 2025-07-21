import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '../styles/globals.css'
import { metadata as sharedMetadata } from './metadata'
import Navbar from '../components/Navbar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = sharedMetadata

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navbar />
        <main className="container mx-auto px-4">
          {children}
        </main>
      </body>
    </html>
  )
}
