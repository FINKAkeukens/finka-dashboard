import type { MetadataRoute } from 'next'

// Maakt het dashboard installeerbaar als app op telefoon/tablet ("Zet op
// beginscherm"). Bewust géén service worker / offline-cache: klantgegevens
// horen niet op het toestel achter te blijven.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FINKA Dashboard',
    short_name: 'FINKA',
    description: 'Intern bedrijfsdashboard FINKA Keukens',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F5F2',
    theme_color: '#F7F5F2',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
