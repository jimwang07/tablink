export default function Home() {
  return (
    <div className="tablink-guest-shell flex min-h-screen items-center justify-center px-4">
      <div className="tablink-bg-orb tablink-bg-orb-top" />
      <div className="tablink-bg-orb tablink-bg-orb-bottom" />
      <div className="tablink-join-layout" style={{ maxWidth: 480, paddingTop: 0, paddingBottom: 0 }}>
        <div className="tablink-overview-card" style={{ textAlign: 'center' }}>
          <div className="tablink-wordmark tablink-wordmark-lg">
            Tab<span className="tablink-wordmark-accent">link</span>
          </div>
          <h1 className="tablink-overview-title" style={{ marginTop: 12 }}>
            Split the bill without the mess.
          </h1>
          <p className="tablink-section-body" style={{ marginTop: 10 }}>
            Claim items, calculate your share, and pay the host — all from one clean link.
          </p>
        </div>
        <div className="tablink-empty-note" style={{ textAlign: 'center' }}>
          If someone sent you a receipt link, open the full URL they shared with you.
        </div>
      </div>
    </div>
  );
}
