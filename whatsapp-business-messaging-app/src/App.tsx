import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import Routes from './routes';
import Navbar from './components/UI/Navbar';

const App: React.FC = () => {
  return (
    <Router>
      <Navbar />
      <Routes />
    </Router>
  );
};

export default App;