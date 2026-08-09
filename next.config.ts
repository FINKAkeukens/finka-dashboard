import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sparticuz/chromium bevat een binair Chromium-bestand (bin/*.br) dat als
  // losse file aanwezig moet blijven op de serverless functie — niet door
  // Next's bundler bewerkt/verplaatst mag worden. Zonder dit bestaat
  // node_modules/@sparticuz/chromium/bin niet meer in de deployed functie.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Extra vangnet naast serverExternalPackages: @sparticuz/chromium bepaalt
  // het pad naar zijn binaire bestanden dynamisch (ipv statisch importeerbaar),
  // waardoor Next's automatische file-tracing de bin/-map soms toch mist.
  outputFileTracingIncludes: {
    "/api/offerte/**": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
