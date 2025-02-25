// src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MapComponent from './components/Map';
import StatsComponent from './components/Stats';
import ControlsComponent from './components/UserControls';
import './style/layout.css';
import './App.css'

const App = () => {
  const [token, setToken] = useState(null);

  useEffect(() => {
    const login = async () => {
      try {
        const response = await axios.post('http://localhost:2150/auth/login', {
          username: 'admin',
          password: 'password' // Replace with your actual password
        });
        setToken(response.data.token);
        localStorage.setItem('token', response.data.token);
      } catch (error) {
        console.error('Error logging in:', error);
      }
    };

    login();
  }, []);

  return (
    <div className="app-container">
      <div className="map-section">
        {token ? <MapComponent token={token} /> : <p>Loading...</p>}
      </div>
      <div className="right-section">
        <div className="stats-section">
          {token ? <StatsComponent token={token} /> : <p>Loading...</p>}
        </div>
        <div className="controls-section">
        {token ? <ControlsComponent token={token} /> : <p>Loading...</p>}
        </div>
      </div>
    </div>
  );
};

export default App;
