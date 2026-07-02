# @verocrest/platform-integrations

Provider adapters: Supabase, Anthropic, OpenAI, Browserless, Google, Resend. Only these packages may import vendor SDKs.

**Owner:** founder · **Blueprint:** docs 11 (all) · **Implementation:** Sprint 5+

Scaffold only (Sprint 1.1). Public surface is `src/index.ts`; internal folders are private
per `docs/03_System_Architecture.md` §5. Cross-domain imports are forbidden (ESLint-enforced
from Sprint 1.3).
