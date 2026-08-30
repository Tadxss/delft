import type { Metadata } from "next";
import { LegalPage } from "../_components/LegalPage";
import {
  CONTACT_EMAIL,
  GOVERNING_LAW,
  LAST_UPDATED,
  OPERATOR,
  OPERATOR_LOCATION,
} from "../_lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms you agree to when you use CrowScribe.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={LAST_UPDATED}>
      <p>
        These terms are an agreement between you and {OPERATOR}, an individual
        based in {OPERATOR_LOCATION} who operates CrowScribe
        (&ldquo;CrowScribe&rdquo;, &ldquo;the service&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using the
        service, you accept these terms and our{" "}
        <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use
        the service.
      </p>

      <h2>The service</h2>
      <p>
        CrowScribe is a free, no-cost workspace for notes, canvases, and an
        encrypted credentials vault. It is provided as-is and is under active
        development. Features may change, and the service runs on free
        infrastructure tiers with the limits that implies.
      </p>

      <h2>Eligibility and your account</h2>
      <ul>
        <li>You must be at least 18 years old and able to enter into a binding contract.</li>
        <li>One account is for one person. Keep your sign-in email address current and your account secure.</li>
        <li>You are responsible for activity that happens under your account.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the service for anything unlawful, or to store or share content you have no right to;</li>
        <li>infringe others&rsquo; intellectual-property or privacy rights;</li>
        <li>upload malware, or attempt to disrupt, overload, or gain unauthorised access to the service or its infrastructure;</li>
        <li>probe or scan the service for vulnerabilities except through good-faith, responsible disclosure to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;</li>
        <li>resell or redistribute the service, or use automated means to create accounts or generate load.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You keep all ownership of the content you create. You grant us the
        limited licence needed to host, store, back up, process, and display
        that content to operate the service for you and for the workspace
        members you share it with. You are responsible for your content and for
        having the rights to it. Content you publish becomes accessible to
        anyone with the link until you unpublish it.
      </p>

      <h2>The credentials vault</h2>
      <p>
        The vault is encrypted in your browser with a key derived from your
        passphrase. We never receive that key and cannot read or recover your
        vault. You are solely responsible for remembering your passphrase and
        for safely storing the one-time recovery key. If you lose both, the only
        way back in is a vault reset, which permanently deletes every entry in
        that vault.
      </p>

      <h2>Workspaces and sharing</h2>
      <p>
        A workspace owner controls its membership and can assign editor or
        viewer roles, remove members, or delete the workspace. Removing a member
        or deleting a workspace immediately revokes access. The credentials
        vault is only ever accessible to the workspace owner.
      </p>

      <h2>Availability, data, and backups</h2>
      <p>
        There is no service-level agreement. We may modify, suspend, or
        discontinue the service, in whole or in part, and will give reasonable
        notice to active users where practical.
      </p>
      <p>
        <strong>Keep your own copies of anything important.</strong> We take
        backups for our own disaster recovery, but we do not guarantee they will
        be complete, current, or successfully restorable, and we are not liable
        for lost or corrupted data. Use the export options where available.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using the service and delete your account at any time from
        Account settings. We may suspend or terminate an account that violates
        these terms or creates risk or legal exposure for the service or other
        users.
      </p>

      <h2>Disclaimer of warranties</h2>
      <p>
        To the fullest extent permitted by law, the service is provided
        &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of
        any kind, express or implied, including merchantability, fitness for a
        particular purpose, and non-infringement. We do not warrant that the
        service will be uninterrupted, secure, or error-free.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, and given that the service is
        provided free of charge, {OPERATOR} will not be liable for any indirect,
        incidental, special, consequential, or punitive damages, or for any loss
        of data, profits, or goodwill, arising from your use of or inability to
        use the service. Where liability cannot be excluded, it is limited to
        PHP 5,000 in aggregate.
      </p>

      <h2>Indemnification</h2>
      <p>
        You agree to indemnify {OPERATOR} against claims arising from your
        content or your misuse of the service in breach of these terms.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. Material changes will be reflected in the
        &ldquo;Last updated&rdquo; date above, and where practical we will notify
        active users by email. Continuing to use the service after a change
        means you accept the updated terms.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of {GOVERNING_LAW}, without regard
        to conflict-of-laws rules. The courts located in {OPERATOR_LOCATION}{" "}
        have exclusive jurisdiction, subject to any mandatory consumer
        protections of your country of residence.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
