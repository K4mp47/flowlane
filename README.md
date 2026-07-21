# FlowLane

FlowLane is an internal, invite-only Kanban task manager for a work department.

## Stack

- React + Vite + TypeScript
- Astryx UI
- dnd-kit
- TanStack Query
- Supabase Free plan: Auth, PostgreSQL, Realtime, Storage
- Netlify Free plan for hosting

## Roles

- `ADMIN`: full workspace and workflow management
- `MEMBER`: create/edit/move/assign tasks, comments and checklists
- `VIEWER`: strictly read-only access to the live Kanban board

Authorization is enforced in Supabase RLS, not only in the frontend.

## Workflow

`BACKLOG -> TO DO -> IN PROGRESS -> REVIEW -> DONE`

Tasks may be incomplete in Backlog. Before leaving Backlog they require context, expected result, task type, priority and at least one Admin/Member assignee.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Required environment variables:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Never expose a Supabase service-role key in the frontend.

## Validation

```bash
npm run lint
npm run build
```

## Hosting

`netlify.toml` configures Vite builds and SPA fallback routing.
