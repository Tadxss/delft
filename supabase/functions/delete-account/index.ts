// Self-serve account deletion (production-readiness Milestone A / item 2). A signed-in user
// permanently deletes their own account: the `auth.users` row goes, which cascades `profiles`
// and every workspace they own (`workspaces.owner_id` FK) → pages / credentials / canvases /
// credential_folders / workspace_members / workspace_invitations. Storage objects aren't
// foreign-keyed, so this function also best-effort-clears them first.
//
// Second Edge Function in the repo, second `SUPABASE_SERVICE_ROLE_KEY` use. `verify_jwt = true`
// (satisfied by the anon key — not the authz boundary); the real check is the in-function
// `getUser()` on the caller's own token. A user can only ever delete themselves.
//
// Guard: if the caller solely owns a workspace that has OTHER members, deletion is blocked with
// `409 {error:"shared-workspaces"}` — there is no ownership-transfer mechanism yet (roadmap item
// 12), and silently destroying invited members' shared content is not acceptable. The user must
// remove those members or delete those workspaces first.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Best-effort recursive-ish delete of a bucket prefix. Never throws — a stuck Storage call must
// not block a user's legal right to delete their account; a leaked object is a slow cost leak
// against the 1 GB free tier, monitored separately.
async function purgePrefix(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
  depth = 2,
): Promise<void> {
  try {
    const { data: entries, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000 });
    if (error || !entries) return;
    const files = entries.filter((e) => e.id !== null).map((e) => `${prefix}/${e.name}`);
    if (files.length > 0) await admin.storage.from(bucket).remove(files);
    if (depth > 0) {
      const folders = entries.filter((e) => e.id === null);
      for (const folder of folders) {
        await purgePrefix(admin, bucket, `${prefix}/${folder.name}`, depth - 1);
      }
    }
  } catch (e) {
    console.error(`[delete-account] purge ${bucket}/${prefix}`, e);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await caller.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Owned workspaces + which ones are shared with other members.
    const { data: owned, error: ownedErr } = await admin
      .from("workspaces")
      .select("id, name")
      .eq("owner_id", user.id);
    if (ownedErr) return json({ error: ownedErr.message }, 500);

    const sharedNames: string[] = [];
    const soloIds: string[] = [];
    for (const ws of owned ?? []) {
      const { count } = await admin
        .from("workspace_members")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", ws.id as string);
      if ((count ?? 0) > 1) sharedNames.push(ws.name as string);
      else soloIds.push(ws.id as string);
    }
    if (sharedNames.length > 0) {
      // Not an error — a precondition result the client renders as guidance. 200 so
      // functions.invoke gives the client the body directly.
      return json({ blocked: "shared-workspaces", workspaces: sharedNames });
    }

    // Storage cleanup (best-effort) before the cascade removes the rows that reference it.
    for (const wsId of soloIds) {
      await purgePrefix(admin, "page-images", wsId);
      await purgePrefix(admin, "workspace-logos", wsId, 0);
    }
    await purgePrefix(admin, "avatars", user.id, 0);

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ deleted: true });
  } catch (e) {
    console.error("[delete-account]", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
