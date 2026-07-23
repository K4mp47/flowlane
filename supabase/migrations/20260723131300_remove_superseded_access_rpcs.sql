-- These temporary RPCs were used during the scoped-access rollout and are now
-- superseded by grant_resource_access/remove_resource_access. Removing them keeps
-- the exposed API surface minimal and avoids duplicate SECURITY DEFINER entrypoints.

drop function if exists public.add_project_member(uuid,uuid,public.workspace_role_type);
drop function if exists public.add_board_member(uuid,uuid,public.workspace_role_type);
