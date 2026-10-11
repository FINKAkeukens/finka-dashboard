import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FINKA Dashboard',
  description: 'Intern bedrijfsdashboard FINKA Keukens',
  // Op iPhone/iPad: na "Zet op beginscherm" opent het dashboard als losse
  // app (zonder Safari-balken) met de naam FINKA.
  appleWebApp: { capable: true, title: 'FINKA', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#F7F5F2',
  // Nodig voor env(safe-area-inset-*) — de onderbalk op de telefoon blijft
  // zo boven de home-indicator van de iPhone.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className="h-full">
      <body className={`${dmSans.className} h-full`}>{children}</body>
    </html>
  )
}
