'use client'

export default function GmailConnectButton({ isConnected }: { isConnected: boolean }) {
  return (
    <a
      href="/api/gmail/auth"
      className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
        isConnected
          ? 'border-[#DDD8D2] text-[#6B6560] hover:border-[#1C1B19] hover:text-[#1C1B19]'
          : 'bg-[#1C1B19] text-white border-[#1C1B19] hover:bg-[#2D2C2A]'
      }`}
    >
      {isConnected ? 'Opnieuw koppelen' : 'Gmail koppelen'}
    </a>
  )
}
