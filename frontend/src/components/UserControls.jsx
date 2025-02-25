import React, { useState } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import '../style//ToggleSwitch.css'; // Import the CSS for the toggle switch

const UserControls = ({token}) => {
  const [isEnabled, setIsEnabled] = useState(true);

  const handleToggle = async () => {
    const newState = !isEnabled;
    setIsEnabled(newState);

    try {
      await axios.post('http://localhost:2150/toggle-advanced-mission-management', { enable: newState },{
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log(`Advanced mission management ${newState ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      console.error('Error toggling advanced mission management:', error);
    }
  };


  const handleReset = async () => {
    try {
      await axios.post('http://localhost:2150/reset', {}, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log('simualtion has been reset.');
    } catch (error) {
      console.error('Error resetting :', error);
    }
  };

  return (
    <div>
      <h3>Simulation Controls</h3>

      <button onClick={handleReset}>Reset Everything</button>
      <div>
        <label className="switch">
          <input type="checkbox" checked={isEnabled} onChange={handleToggle} />
          <span className="slider round"></span>
        </label>
        <span>{isEnabled ? 'Advanced Mission Management Enabled' : 'Advanced Mission Management Disabled'}</span>
      </div>
    </div>
  );
};
UserControls.propTypes = {
  token: PropTypes.string.isRequired,
};

export default UserControls;