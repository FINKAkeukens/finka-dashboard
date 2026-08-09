import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FINKA Dashboard',
  description: 'Intern bedrijfsdashboard FINKA Keukens',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className="h-full">
      <body className={`${dmSans.className} h-full`}>{children}</body>
    </html>
  )
}
