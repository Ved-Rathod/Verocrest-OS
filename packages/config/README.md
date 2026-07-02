# @verocrest/config

Zod-validated environment schema and shared configuration.

**Owner:** founder · **Blueprint:** `docs/12_Infrastructure_Deployment.md` §3 (environments), §5 (secrets); `docs/03_System_Architecture.md` §5 (module layout)

## Contract

- `getServerEnv()` — cached, validated environment. The standard read path for app code.
- `parseServerEnv(source?)` — explicit parse; throws `EnvValidationError` listing **every** problem.
- The app must call `getServerEnv()` at boot so a misconfigured deploy fails fast, not mid-request.

## Rules

- Server-only. Never import from client components (no secrets in bundles — enforced in Sprint 1.3 lint rules).
- Provider variables are added here in the sub-sprint that wires each integration
  (`docs/11_External_Integrations.md` §12 is the catalogue).
- `process.env` parsing ignores unknown keys by design; API-input parsing does the opposite
  (`docs/10_API_Architecture.md` §9.4).
