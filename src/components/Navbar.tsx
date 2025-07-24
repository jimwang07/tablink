import Link from 'next/link';

const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="navbar-content">
        <div className="navbar-logo">
          <Link href="/">
            <img src="/cashapp-logo.svg" alt="CashApp" className="cashapp-logo-nav" />
          </Link>
        </div>
        <div className="navbar-links">
          <Link href="/create-receipt" className="nav-link upload-nav-button">Upload</Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 