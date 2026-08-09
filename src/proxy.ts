import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // 'api' expliciet uitgesloten: de middleware-runtime heeft een lage limiet
  // voor de request body (~10MB), waar PDF-uploads (werkblad/Winner Flex/
  // apparatuur-offerte) overheen kunnen gaan — dan crasht de body-parse nog
  // vóórdat de API-route zelf iets ziet. API-routes doen hun eigen
  // auth-check via supabase.auth.getUser(), dus hebben deze sessie-refresh
  // sowieso niet nodig.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
