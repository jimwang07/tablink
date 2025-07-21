import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import BillFronterPage from './pages/BillFronterPage';
import ItemClaimerPage from './pages/ItemClaimerPage';

const App: React.FC = () => {
  return (
    <Router>
      <div className="App">
        <Navbar />
        <div className="app-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/bill-fronter/:receiptId" element={<BillFronterPage />} />
            <Route path="/item-claimer/:receiptId" element={<ItemClaimerPage />} />
            {/* Legacy routes for backward compatibility */}
            <Route path="/fronter" element={<BillFronterPage />} />
            <Route path="/claimer" element={<ItemClaimerPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App;
