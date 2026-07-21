# FlowLane Supabase backend

Remote project: `kanBan tutondo` (`rmkiinhprqcscyvdoxpc`).

The migrations in this directory mirror the schema already applied to the remote Free-plan project. The `invite-member` Edge Function is also deployed remotely with JWT verification enabled.

## Free-tier constraints

This project intentionally avoids paid Supabase branches, paid compute add-ons and PITR. Realtime, Auth, Postgres, Storage and Edge Functions are used within the Free plan quotas.

## Apply to another project

With the Supabase CLI linked to a project:

```bash
supabase db push
supabase functions deploy invite-member
```

Never expose the Supabase service-role/secret key in the frontend. The browser uses only the publishable key.
