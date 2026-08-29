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
//   RESEND_FROM     – verified sender, e.g. `CrowScribe <invites@mail.crowscribe.app>`
//   SITE_URL        – app origin for the accept link (never taken from the caller)
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

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

// Workspace / inviter names are free text (not sanitized by invite_to_workspace) — escape before
// interpolating into the HTML email so a workspace named `<a href=…>` can't ride our verified
// sending domain as a phishing payload.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function renderHtml(o: {
  inviter: string;
  workspace: string;
  role: string;
  acceptUrl: string;
  fallbackUrl: string;
  expires: string;
}): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:28px 32px 8px;font-size:15px;font-weight:600;color:#4b5563;">CrowScribe</td></tr>
        <tr><td style="padding:8px 32px 4px;font-size:18px;font-weight:600;color:#111827;">
          ${esc(o.inviter)} invited you to join ${esc(o.workspace)}
        </td></tr>
        <tr><td style="padding:4px 32px 20px;font-size:14px;color:#6b7280;">
          You've been added as <strong style="color:#374151;">${esc(o.role)}</strong>.
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <a href="${esc(o.acceptUrl)}" style="display:inline-block;background:#8b5cf6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">Accept invitation</a>
        </td></tr>
        <tr><td style="padding:0 32px 24px;font-size:12px;color:#9ca3af;line-height:1.5;">
          Or paste this link into your browser:<br>
          <span style="color:#6b7280;word-break:break-all;">${esc(o.fallbackUrl)}</span>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;line-height:1.5;">
          This invitation expires on ${esc(o.expires)}. If you weren't expecting it, you can ignore this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderText(o: {
  inviter: string;
  workspace: string;
  role: string;
  acceptUrl: string;
  expires: string;
}): string {
  return [
    `${o.inviter} invited you to join ${o.workspace} on CrowScribe as ${o.role}.`,
    ``,
    `Accept: ${o.acceptUrl}`,
    ``,
    `This invitation expires on ${o.expires}. If you weren't expecting it, you can ignore this email.`,
  ].join("\n");
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

    const tmpl = {
      inviter: invitation.inviter_name,
      workspace: invitation.workspace_name ?? "a workspace",
      role: invitation.role,
      acceptUrl: actionLink,
      fallbackUrl,
      expires: new Date(invitation.expires_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    };

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM"),
        to: [invitation.invited_email],
        subject: `${tmpl.inviter} invited you to join ${tmpl.workspace} on CrowScribe`,
        html: renderHtml(tmpl),
        text: renderText(tmpl),
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
