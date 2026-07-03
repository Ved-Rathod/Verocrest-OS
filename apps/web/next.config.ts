import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Internal packages export TypeScript source directly (Turborepo internal-package
  // pattern, docs/03_System_Architecture.md §3.6 note). Next transpiles them here.
  transpilePackages: [
    '@verocrest/config',
    '@verocrest/ui-kit',
    '@verocrest/domain-auth',
    '@verocrest/domain-contacts',
    '@verocrest/platform-integrations',
    '@verocrest/platform-tenancy',
  ],
};

export default nextConfig;
