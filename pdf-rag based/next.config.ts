import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: [
    "pdf-parse", 
    "chromadb"
  ],
};


export default nextConfig;
