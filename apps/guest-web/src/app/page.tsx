export default function Home() {
  return (
    <div className="tablink-guest-shell flex min-h-screen items-center justify-center px-4">
      <div className="tablink-card w-full max-w-xl text-center">
        <div className="tablink-overline mb-3">Tablink</div>
        <h1 className="tablink-section-title mb-4">Split the bill without the mess.</h1>
        <p className="tablink-section-body mb-4">
          Claim items, calculate your share, and pay the host from one clean link.
        </p>
        <p className="tablink-empty-note">
          If someone sent you a receipt link, open the full URL they shared with you.
        </p>
      </div>
    </div>
  );
}
