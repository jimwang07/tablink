import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s | Cash Link',
    default: 'Cash Link - Split Bills Easily',
  },
  description: 'Split bills easily with your friends using Cash Link',
  metadataBase: new URL('http://localhost:3000'),
  openGraph: {
    title: 'Cash Link',
    description: 'Split bills easily with your friends',
    locale: 'en_US',
    type: 'website',
  },
}
