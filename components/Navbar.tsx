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
          <Link href="/fronter" className="nav-link">Bill Fronter</Link>
          <Link href="/claimer" className="nav-link">Item Claimer</Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 