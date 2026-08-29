// Sends the branded "you've been invited to {workspace}" email for a workspace invitation whose
// `invited_email` is set. Triggered fire-and-forget by useInviteToWorkspace.onSuccess — the
// invitation row is already the source of truth, this is best-effort delivery.
//
// This is the first Edge Function in the repo and the first place the service-role key is used.
// It no-ops (returns 200 immediately) when RESEND_API_KEY is unset, so local dev and CI need no
// Resend account — the client's `.catch(() => {})` swallows everything either way.
//
// Secrets (supabase/functions/.env locally, `supabase secrets set` hosted):
//   RESEND_API_KEY  – unset ⇒ this function is inert
//   RESEND_FROM     – verified sender; hosted value is `CrowScribe <invites@send.crowscribe.space>`
//   SITE_URL        – app origin for the accept link (never taken from the caller)
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { emailLayout, emailText, esc } from "../_shared/email.ts";

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

interface InvitationRow {
  invited_email: string | null;
  status: string;
  invited_by: string;
  role: string;
  expires_at: string;
  last_emailed_at: string | null;
  workspace_name: string | null;
  workspace_owner_id: string | null;
  inviter_name: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { token } = (await req.json().catch(() => ({}))) as {
      token?: string;
    };
    if (!token) return json({ error: "token required" }, 400);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.log("[send-invitation-email] RESEND_API_KEY unset — skipping");
      return json({ skipped: "no-api-key" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await admin.rpc("get_invitation_for_email", {
      p_token: token,
    });
    if (error) return json({ error: error.message }, 500);
    const inv = (Array.isArray(data) ? data[0] : data) as
      | InvitationRow
      | undefined;

    // Authorize FIRST — an unauthorized caller (incl. anon-key JWT) gets one undifferentiated
    // response whether the token is bogus, not theirs, or a real pending invite. `verify_jwt` is
    // not the authz boundary here; this getUser() check is.
    const authHeader = req.headers.get("Authorization");
    const authorized = await (async () => {
      if (!inv || !authHeader) return false;
      const caller = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const {
        data: { user },
      } = await caller.auth.getUser();
      return (
        !!user &&
        (user.id === inv.invited_by || user.id === inv.workspace_owner_id)
      );
    })();
    if (!authorized) return json({ skipped: "not-authorized" });

    if (inv!.status !== "pending") return json({ skipped: "not-pending" });
    if (!inv!.invited_email) return json({ skipped: "no-email" });

    const invitation = inv!;

    // Per-invite send throttle: 60s since the last send for this token.
    if (
      invitation.last_emailed_at &&
      Date.now() - Date.parse(invitation.last_emailed_at) < 60_000
    ) {
      return json({ skipped: "throttled" });
    }

    const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
    const fallbackUrl = `${siteUrl}/invite/${token}`;

    // generateLink RETURNS the link, never sends. `magiclink` for an existing user; fall back to
    // `invite` (which also creates the user) if the recipient has no account yet.
    let actionLink = fallbackUrl;
    for (const type of ["magiclink", "invite"] as const) {
      const { data: linkData, error: linkErr } =
        await admin.auth.admin.generateLink({
          type,
          email: invitation.invited_email!,
          options: { redirectTo: fallbackUrl },
        });
      if (!linkErr && linkData?.properties?.action_link) {
        actionLink = linkData.properties.action_link;
        break;
      }
      if (linkErr) {
        console.log(
          `[send-invitation-email] generateLink(${type}) failed: ${linkErr.message}`,
        );
      }
    }

    const inviter = invitation.inviter_name;
    const workspace = invitation.workspace_name ?? "a workspace";
    const role = invitation.role;
    const expires = new Date(invitation.expires_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const footerNote = `This invitation expires on ${expires}. If you weren't expecting it, you can ignore this email.`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM"),
        to: [invitation.invited_email],
        subject: `${inviter} invited you to join ${workspace} on CrowScribe`,
        html: emailLayout({
          preview: `${inviter} invited you to join ${workspace} on CrowScribe`,
          heading: `${esc(inviter)} invited you to join ${esc(workspace)}`,
          bodyHtml: `You've been added as <strong>${esc(role)}</strong>.`,
          cta: { label: "Accept invitation", url: actionLink },
          footerNote,
        }),
        text: emailText({
          heading: `${inviter} invited you to join ${workspace} on CrowScribe as ${role}.`,
          body: "Open the link below to accept:",
          url: actionLink,
          footerNote,
        }),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[send-invitation-email] Resend ${res.status}`);
      return json({ error: `resend ${res.status}` }, 500);
    }
    await admin.rpc("mark_invitation_emailed", { p_token: token });
    const sent = (await res.json()) as { id?: string };
    return json({ sent: true, id: sent.id });
  } catch (e) {
    console.error("[send-invitation-email]", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
