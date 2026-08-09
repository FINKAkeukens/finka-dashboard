import { createClient } from '@supabase/supabase-js'

// Service-role client zonder cookies/sessie — voor server actions en publieke
// portaalroutes die buiten de ingelogde interne sessie om data nodig hebben
// (het token wordt in de aanroepende route zelf gevalideerd).
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
