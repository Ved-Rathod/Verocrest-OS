import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Internal packages export TypeScript source directly (Turborepo internal-package
  // pattern, docs/03_System_Architecture.md §3.6 note). Next transpiles them here.
  // Packages are appended as the app starts consuming them (Sprint 1.4+).
  transpilePackages: ['@verocrest/config'],
};

export default nextConfig;
