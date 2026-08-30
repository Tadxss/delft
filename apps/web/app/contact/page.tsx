import type { Metadata } from "next";
import { LegalPage } from "../_components/LegalPage";
import { CONTACT_EMAIL, OPERATOR, OPERATOR_LOCATION } from "../_lib/legal";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach CrowScribe for support, bugs, and privacy requests.",
};

export default function ContactPage() {
  return (
    <LegalPage title="Contact">
      <p>
        CrowScribe is operated by {OPERATOR}, an individual based in{" "}
        {OPERATOR_LOCATION}. For anything at all — support, a bug report, a
        feature idea, a security disclosure, or a privacy request (access,
        correction, deletion, or a copy of your data) — email:
      </p>
      <p>
        <strong>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </strong>
      </p>
      <p>
        This is a free service run by one person, so replies are best-effort and
        may take a few days. Security issues are prioritised — please report
        them privately to the address above rather than publicly, and give us a
        reasonable chance to fix them.
      </p>
      <p>
        For details on how your data is handled, see the{" "}
        <a href="/privacy">Privacy Policy</a>. For the rules of using the
        service, see the <a href="/terms">Terms of Service</a>.
      </p>
    </LegalPage>
  );
}
