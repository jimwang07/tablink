import Link from 'next/link';

const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="navbar-content">
        <div className="navbar-logo">
          <Link href="/">
            <div style={{ 
              width: '32px', 
              height: '32px', 
              backgroundColor: '#00D632', 
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '18px',
              fontWeight: '700'
            }}>
              $
            </div>
          </Link>
        </div>
        <div className="navbar-links">
          <Link href="/create-receipt" className="nav-link upload-nav-button">
            <span>📷</span>
            Scan
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
