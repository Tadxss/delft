import type { Metadata } from "next";
import { LegalPage } from "../_components/LegalPage";
import {
  CONTACT_EMAIL,
  LAST_UPDATED,
  OPERATOR,
  OPERATOR_LOCATION,
} from "../_lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How CrowScribe collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={LAST_UPDATED}>
      <p>
        CrowScribe (&ldquo;CrowScribe&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
        is a free, single-operator workspace for notes, canvases, and an
        encrypted credentials vault. It is operated by {OPERATOR}, an individual
        based in {OPERATOR_LOCATION}, who is the data controller for the purposes
        of this policy. Contact:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <p>
        This policy explains what personal data we process and why. It is
        written to align with the Philippine Data Privacy Act of 2012 (RA
        10173), and includes sections for users covered by the EU/UK GDPR and
        the California CCPA/CPRA.
      </p>

      <h2>Data we process</h2>
      <table>
        <tbody>
          <tr>
            <th>Account</th>
            <td>
              Your email address (entered directly, or provided by Google if you
              sign in with Google). We do not store passwords in readable form —
              authentication is handled by our provider, Supabase.
            </td>
          </tr>
          <tr>
            <th>Profile</th>
            <td>
              Information you choose to enter during onboarding or in account
              settings: display name, occupation, company, short bio, how you
              intend to use the product, an optional avatar image, and an
              optional username.
            </td>
          </tr>
          <tr>
            <th>Content</th>
            <td>
              Everything you create in the app: pages and their text/images,
              canvases, workspace names, descriptions and logos, and your
              folder structure.
            </td>
          </tr>
          <tr>
            <th>Credentials vault</th>
            <td>
              Secrets you store in the vault (usernames, passwords, notes) are
              encrypted in your browser with a key derived from your vault
              passphrase before they are sent to us.{" "}
              <strong>We cannot read them and cannot recover them.</strong> The
              title and URL of each vault entry are stored unencrypted so the
              list is searchable.
            </td>
          </tr>
          <tr>
            <th>Workspace sharing</th>
            <td>
              If you invite someone to a workspace, we process the email address
              or username you enter in order to deliver the invitation and,
              once accepted, to record their membership and role.
            </td>
          </tr>
          <tr>
            <th>Technical</th>
            <td>
              Server and infrastructure logs (including IP address and browser
              user-agent) kept by our hosting providers for security and
              debugging; anonymous web-performance measurements (Core Web
              Vitals) via Vercel Speed Insights; and error reports via Sentry,
              which may include a stack trace and the URL where an error
              occurred.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>How and why we use it</h2>
      <ul>
        <li>To provide the service — store and display your content, run your workspaces, authenticate you.</li>
        <li>To send transactional email — sign-in links and workspace invitations. We do not send marketing email.</li>
        <li>To keep the service secure and prevent abuse — rate limiting, investigating suspicious activity.</li>
        <li>To understand and improve performance and reliability in aggregate.</li>
      </ul>
      <p>
        <strong>Legal bases (GDPR).</strong> Processing of your account and
        content is necessary to perform our agreement with you (Art. 6(1)(b)).
        Security, abuse prevention, and aggregate performance monitoring rely on
        our legitimate interests (Art. 6(1)(f)). Where we ask for consent, you
        may withdraw it at any time.
      </p>

      <h2>Service providers (sub-processors)</h2>
      <p>
        We do not sell your personal data and we do not share it for
        advertising. We rely on the following processors to run the service:
      </p>
      <ul>
        <li>
          <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Supabase</a>{" "}
          — database, authentication, file storage, and transactional-email delivery.
        </li>
        <li>
          <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel</a>{" "}
          — application hosting and anonymous performance measurement.
        </li>
        <li>
          <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Resend</a>{" "}
          — transactional email sending.
        </li>
        <li>
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google</a>{" "}
          — only if you choose &ldquo;Continue with Google&rdquo; to sign in.
        </li>
        <li>
          <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer">Sentry</a>{" "}
          — application error monitoring.
        </li>
      </ul>

      <h2>Sharing and publishing</h2>
      <p>
        Content in a shared workspace is visible to the other members you or the
        workspace owner have invited, according to their role (owner, editor, or
        viewer). If you publish a page or canvas, it becomes accessible to
        anyone who has the link, and may be retrieved by others you share it
        with; unpublish it to revoke access.
      </p>

      <h2>International transfers</h2>
      <p>
        Our providers operate infrastructure that may be located outside{" "}
        {OPERATOR_LOCATION}, including in the United States and the European
        Union. Where required, we rely on the providers&rsquo; own transfer
        safeguards (such as Standard Contractual Clauses).
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We keep your data for as long as your account is active. You can delete
        your account at any time from Account settings; this permanently removes
        your account, profile, and the content of workspaces you solely own,
        normally within 30 days. Residual copies in encrypted backups are purged
        on the backup rotation, within 35 days. Infrastructure logs held by our
        providers expire on their own schedules (typically days to a few weeks).
      </p>
      <p>
        Because the vault is encrypted with a key we never receive, if you lose
        both your vault passphrase and your recovery key, the vault contents
        cannot be recovered by us or anyone else.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        We use only what is strictly necessary to run the service: a session
        token to keep you signed in (set by Supabase), and a small preference
        for your light/dark theme. We do not use advertising or cross-site
        tracking cookies, so there is no consent banner.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the Data Privacy Act, the GDPR, and the CCPA/CPRA as applicable to
        you, you may request access to your data, correction of inaccurate data,
        deletion, a portable copy, and restriction of or objection to certain
        processing, and you may withdraw consent. Exercise most of these
        directly in the app (edit your profile, delete your account) or by
        emailing <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will
        respond within the timeframe the applicable law requires.
      </p>
      <p>
        If you are in the Philippines and believe your rights have been
        violated, you may lodge a complaint with the National Privacy
        Commission (<a href="https://www.privacy.gov.ph" target="_blank" rel="noopener noreferrer">privacy.gov.ph</a>).
        Users in the EU/UK may complain to their local supervisory authority.
      </p>

      <h2>Children</h2>
      <p>
        CrowScribe is not directed to children under 18, and we do not
        knowingly collect their personal data.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy as the service evolves. Material changes will
        be reflected in the &ldquo;Last updated&rdquo; date above, and where
        practical we will notify active users by email.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
