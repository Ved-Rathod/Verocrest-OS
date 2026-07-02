# infra/

Light-touch infrastructure state for a managed-platform stack
(`docs/12_Infrastructure_Deployment.md` §8.3). No Terraform/K8s in v0.1 by design.

- `state/` — monthly scripted snapshots of Vercel / Supabase / Inngest project settings
- `dns/` — quarterly Cloudflare zone-file exports
