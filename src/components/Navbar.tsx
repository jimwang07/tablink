import React from 'react';
import { Link } from 'react-router-dom';

const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="navbar-content">
        <div className="navbar-logo">
          <Link to="/">
            <img src="/cashapp-logo.svg" alt="CashApp" className="cashapp-logo-nav" />
          </Link>
        </div>
        <div className="navbar-links">
          <Link to="/fronter" className="nav-link">Bill Fronter</Link>
          <Link to="/claimer" className="nav-link">Item Claimer</Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;