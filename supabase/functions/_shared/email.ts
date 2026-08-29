// Shared branded email layout for CrowScribe's Resend-sent transactional emails (currently just
// send-invitation-email; any future function reuses this). `_shared/` is the Supabase convention
// for code imported by functions but not itself deployed as one.
//
// The GoTrue auth templates in `supabase/templates/*.html` are hand-kept visually identical to
// what emailLayout() produces — they can't share this code (static HTML + Go `{{ }}` vars), so
// any change to the structure/colors here must be mirrored there. One design, two renderers.
//
// Design: light card on a neutral page, electric-violet accent (#6d28d9 — the app's light-mode
// `--accent-500`), system font stack (the app ships no webfont, deliberately). A
// `prefers-color-scheme: dark` block flips the surfaces to the app's obsidian palette; the CTA
// and links stay violet in both. `color-scheme` meta stops clients from aggressively
// auto-inverting the light version.

// Workspace / inviter names etc. are free text — escape before interpolating into HTML so a
// value like `<a href=…>` can't ride our verified sending domain as a phishing payload.
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const LOGO_URL = "https://crowscribe.space/apple-icon";
const TAGLINE = "Where ideas take flight.";

interface LayoutInput {
  /** Hidden preheader text (inbox preview line). */
  preview: string;
  /** Plain-text headline; rendered bold. Not escaped — pass a trusted string or pre-escape. */
  heading: string;
  /** Inner HTML for the body paragraph. Caller is responsible for escaping interpolated values. */
  bodyHtml: string;
  cta: { label: string; url: string };
  /** Fine-print line under the divider. Plain text. */
  footerNote: string;
}

export function emailLayout(o: LayoutInput): string {
  const url = esc(o.cta.url);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  @media (prefers-color-scheme: dark) {
    .cs-page { background: #111318 !important; }
    .cs-card { background: #1a1f28 !important; border-color: #262c38 !important; }
    .cs-wordmark, .cs-heading { color: #e8eaf0 !important; }
    .cs-body { color: #a0a8b8 !important; }
    .cs-muted, .cs-fineprint { color: #8790a0 !important; }
    .cs-link { color: #a78bfa !important; }
    .cs-divider { border-color: #262c38 !important; }
  }
</style>
</head>
<body class="cs-page" style="margin:0;padding:0;background:#f4f5f7;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="cs-card" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:28px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:10px;"><img src="${LOGO_URL}" width="40" height="40" alt="" style="display:block;border-radius:9px;"></td>
            <td class="cs-wordmark" style="font-size:16px;font-weight:600;color:#0f172a;">CrowScribe</td>
          </tr></table>
        </td></tr>
        <tr><td class="cs-heading" style="padding:20px 32px 4px;font-size:18px;font-weight:600;color:#0f172a;line-height:1.4;">
          ${o.heading}
        </td></tr>
        <tr><td class="cs-body" style="padding:4px 32px 20px;font-size:14px;color:#5b6577;line-height:1.6;">
          ${o.bodyHtml}
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <a href="${url}" class="cs-button" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">${esc(o.cta.label)}</a>
        </td></tr>
        <tr><td class="cs-muted" style="padding:0 32px 24px;font-size:12px;color:#94a0b4;line-height:1.5;">
          Or paste this link into your browser:<br>
          <a href="${url}" class="cs-link" style="color:#6d28d9;word-break:break-all;">${url}</a>
        </td></tr>
        <tr><td style="padding:0 32px;"><div class="cs-divider" style="border-top:1px solid #f0f1f3;"></div></td></tr>
        <tr><td class="cs-fineprint" style="padding:16px 32px 8px;font-size:12px;color:#94a0b4;line-height:1.5;">
          ${esc(o.footerNote)}
        </td></tr>
        <tr><td class="cs-fineprint" style="padding:0 32px 28px;font-size:12px;color:#94a0b4;">
          CrowScribe — ${TAGLINE}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

interface TextInput {
  heading: string;
  body: string;
  url: string;
  footerNote: string;
}

export function emailText(o: TextInput): string {
  return [
    o.heading,
    "",
    o.body,
    "",
    o.url,
    "",
    o.footerNote,
    "",
    `CrowScribe — ${TAGLINE}`,
  ].join("\n");
}
