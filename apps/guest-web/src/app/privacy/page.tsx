import type { Metadata } from "next";
import Link from "next/link";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "tablink07@gmail.com";
const effectiveDate = "July 22, 2026";

export const metadata: Metadata = {
  title: "Tablink Privacy Policy",
  description: "Privacy policy for Tablink.",
};

const sections = [
  {
    title: "Information we collect",
    body: [
      "Account information, such as your email address, display name, and authentication provider when you sign in.",
      "Receipt information, such as receipt photos, merchant names, dates, item names, prices, tax, tip, discounts, fees, totals, and parsed receipt data.",
      "Split information, such as guest names, optional guest phone numbers, claimed items, covered amounts, payment status, reminders, and activity updates.",
      "Payment handle information that hosts choose to add, such as Venmo, Cash App, PayPal, or Zelle identifiers.",
      "Basic technical information needed to operate the service, such as device, browser, logs, and error information.",
    ],
  },
  {
    title: "How we use information",
    body: [
      "To create, parse, save, and share receipts.",
      "To let hosts and guests claim items, calculate balances, split tax, tip, discounts, and fees, and track settlement status.",
      "To show payment options provided by the host. Tablink does not process payments directly.",
      "To send or prepare reminders when someone still needs to claim items or settle up.",
      "To provide support, troubleshoot issues, protect the service, and improve the app.",
    ],
  },
  {
    title: "How information is shared",
    body: [
      "When a host shares a Tablink, guests with the link can view the shared receipt details needed to claim items and settle up.",
      "Guests may see participant names, item claims, payment status, and host payment handles that are relevant to the shared receipt.",
      "We use service providers to run Tablink, including hosting, database, authentication, storage, and receipt parsing providers.",
      "We do not sell personal information.",
    ],
  },
  {
    title: "Receipt photos and parsing",
    body: [
      "Receipt photos may be uploaded and stored so Tablink can parse and display the receipt.",
      "Receipt images may be sent to receipt parsing services to extract items and totals.",
      "You should avoid uploading receipts that contain sensitive information you do not want stored or processed.",
    ],
  },
  {
    title: "Payments",
    body: [
      "Tablink helps people calculate what they owe and track whether they have settled up.",
      "Tablink does not hold funds, move money, or process payments directly.",
      "If you choose to pay through Venmo, Cash App, PayPal, Zelle, or another payment app, that payment is handled by the third-party payment provider and is subject to that provider's terms and privacy policy.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "Hosts can edit or delete receipt information available in the app.",
      "Guests can choose whether to provide an optional phone number for reminders.",
      "Signed-in users can delete their account from Settings in the Tablink mobile app.",
      "You can contact us to request help accessing or correcting information associated with your account.",
    ],
  },
  {
    title: "Data retention",
    body: [
      "We keep information for as long as needed to provide Tablink, support users, maintain security, and comply with legal obligations.",
      "When you delete your account in the app, Tablink deletes your account, saved receipts, payment info, receipt photos, and shared links.",
    ],
  },
  {
    title: "Children's privacy",
    body: [
      "Tablink is not intended for children under 13. We do not knowingly collect personal information from children under 13.",
    ],
  },
  {
    title: "Changes to this policy",
    body: [
      "We may update this Privacy Policy from time to time. If we make material changes, we will update the effective date on this page.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="tablink-guest-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="tablink-join-layout" style={{ maxWidth: 760 }}>
        <section className="tablink-overview-card">
          <Link href="/" className="tablink-wordmark">
            Tab<span className="tablink-wordmark-accent">link</span>
          </Link>
          <div className="tablink-overline" style={{ marginTop: 24 }}>
            Privacy Policy
          </div>
          <h1 className="tablink-overview-title">Tablink Privacy Policy</h1>
          <p className="tablink-section-body" style={{ marginTop: 10 }}>
            Effective date: {effectiveDate}
          </p>
          <p className="tablink-section-body" style={{ marginTop: 12 }}>
            This Privacy Policy explains how Tablink collects, uses, and shares information when you use the
            Tablink mobile app and guest web links.
          </p>
        </section>

        {sections.map((section) => (
          <section className="tablink-card" key={section.title}>
            <div className="tablink-card-head">
              <h2 className="tablink-section-title">{section.title}</h2>
            </div>
            <div className="tablink-detail-rows" style={{ marginTop: 0 }}>
              {section.body.map((item) => (
                <div key={item} className="tablink-detail-row" style={{ alignItems: "flex-start" }}>
                  <p className="tablink-section-body">{item}</p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="tablink-card">
          <div className="tablink-card-head">
            <h2 className="tablink-section-title">Contact us</h2>
          </div>
          <p className="tablink-section-body">
            If you have questions about this Privacy Policy or need help with your data, contact us at{" "}
            <a href={`mailto:${supportEmail}`} className="tablink-wordmark-accent">
              {supportEmail}
            </a>
            .
          </p>
          <div style={{ marginTop: 18 }}>
            <Link href="/support" className="tablink-secondary-button">
              <span>Support</span>
              <span>Get help</span>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
