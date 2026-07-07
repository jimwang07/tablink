import type { Metadata } from "next";
import Link from "next/link";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "tablink07@gmail.com";

export const metadata: Metadata = {
  title: "Tablink Support",
  description: "Get help with Tablink receipt splitting.",
};

const helpItems = [
  {
    title: "Scanning or uploading a receipt",
    body: "If scanning does not work, try uploading a clear photo of the receipt with all totals visible.",
  },
  {
    title: "Sharing a Tablink",
    body: "Hosts can share a link, show a QR code, or copy the link. Guests do not need an account to pick what they ordered.",
  },
  {
    title: "Payments",
    body: "Tablink does not process payments directly. Friends can pay the host using the host's preferred payment app, then payments can be marked as settled in Tablink.",
  },
  {
    title: "Account access",
    body: "The mobile app supports Sign in with Apple, Google sign-in, and magic-link email sign-in.",
  },
];

export default function SupportPage() {
  return (
    <main className="tablink-guest-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="tablink-join-layout" style={{ maxWidth: 680 }}>
        <section className="tablink-overview-card">
          <Link href="/" className="tablink-wordmark">
            Tab<span className="tablink-wordmark-accent">link</span>
          </Link>
          <div className="tablink-overline" style={{ marginTop: 24 }}>
            Support
          </div>
          <h1 className="tablink-overview-title">How can we help?</h1>
          <p className="tablink-section-body" style={{ marginTop: 10 }}>
            Get help with scanning receipts, sharing links, guest claims, payment tracking, and account access.
          </p>
          <a
            className="tablink-primary-button"
            href={`mailto:${supportEmail}`}
            style={{ marginTop: 22 }}
          >
            <span>Email support</span>
            <span>{supportEmail}</span>
          </a>
        </section>

        <section className="tablink-card">
          <div className="tablink-card-head">
            <div className="tablink-overline">Common questions</div>
            <h2 className="tablink-section-title">Quick help</h2>
          </div>
          <div className="tablink-detail-rows">
            {helpItems.map((item) => (
              <div key={item.title} className="tablink-detail-row" style={{ alignItems: "flex-start", gap: 18 }}>
                <div>
                  <div className="tablink-detail-value">{item.title}</div>
                  <p className="tablink-section-body" style={{ marginTop: 6 }}>
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="tablink-card">
          <div className="tablink-card-head">
            <div className="tablink-overline">Before contacting support</div>
            <h2 className="tablink-section-title">Include these details</h2>
          </div>
          <p className="tablink-section-body">
            Please include your device model, iOS version, what you were trying to do, and any error message you saw.
            If the issue is about a receipt, include the merchant name and approximate time it was created.
          </p>
        </section>
      </div>
    </main>
  );
}
