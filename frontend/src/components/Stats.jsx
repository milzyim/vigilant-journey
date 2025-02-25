// src/components/Stats.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';

const Stats = ({ token }) => {
    const [simulatedDays, setSimulatedDays] = useState('');
    const [simulatedTime, setSimulatedTime] = useState('');
    const [foodWaste, setFoodWaste] = useState([]);
    const [foodWasteTotalCount, setFoodWasteTotalCount] = useState([]);
    const [isFoodSurplusDropdownOpen, setIsFoodSurplusDropdownOpen] = useState(false);
    const [isFoodWasteDropdownOpen, setIsFoodWasteDropdownOpen] = useState(false);

    const [foodDailyConsumption, setFoodDailyConsumption] = useState(false);
    const [foodTotalConsumption, setFoodTotalConsumption] = useState(false);
    const [recipeDailyConsumption, setRecipeDailyConsumption] = useState(false);
    const [recipeTotalConsumption, setRecipeTotalConsumption] = useState(false);
    const [totalStoredFood, setTotalStoredFood] = useState(false);
    const [totalFridgeCap, setTotalFridgeCap] = useState(false);
    const [totalSurplus, setTotalSurplus] = useState(false);
    const [categorizedSurplus, setCategorizedSurplus] = useState(false);
    
    useEffect(() => {
      // Fetch simulated time

      const updateStat = async () => {

        const simulatedTimeResponse = await axios.get('http://localhost:2150/simulated-time-elpase', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        setSimulatedDays(`${simulatedTimeResponse.data.simulatedDays} days`);
        setSimulatedTime(`${simulatedTimeResponse.data.currentTimeinDay}`);

        const surplusPoolResponse = await axios.get('http://localhost:2150/surplus-pool', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        setTotalSurplus(surplusPoolResponse.data.totalSurplusFood);
        setCategorizedSurplus(surplusPoolResponse.data.categorizedFoodTotals);

        const foodWasteOverviewResponse = await axios.get('http://localhost:2150/foodwaste-overview', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        setFoodWaste(foodWasteOverviewResponse.data.categorized_discarded_food);
        setFoodWasteTotalCount(foodWasteOverviewResponse.data.total_discarded_food_count);

        const dailyConsumptionResponse = await axios.get('http://localhost:2150/daily-consumption', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        setFoodDailyConsumption(dailyConsumptionResponse.data.food.total);
        setRecipeDailyConsumption(dailyConsumptionResponse.data.recipes);

      }

      const updateFoodConsumption = async () => {
                // Fetch food waste overview
            const totalConsumptionResponse = await axios.get('http://localhost:2150/total-consumption', {
              headers: {
                Authorization: `Bearer ${token}`
              }
            });
            setFoodTotalConsumption(totalConsumptionResponse.data.food.total);
            setRecipeTotalConsumption(totalConsumptionResponse.data.recipes);

            const householdFoodCountResponse = await axios.get('http://localhost:2150/households-food-count', {
              headers: {
                Authorization: `Bearer ${token}`
              }
            });
            setTotalStoredFood(householdFoodCountResponse.data.total);
            setTotalFridgeCap(householdFoodCountResponse.data.totalCap);

      }

        // Fetch simulated time every second
      const intervalId = setInterval(updateStat, 1000);
      const intervalId2 = setInterval(updateFoodConsumption, 5000);

      updateStat();
      updateFoodConsumption();

        // Cleanup interval on component unmount
        return () => {clearInterval(intervalId); clearInterval(intervalId2);};

    }, [token]);

    const totalWastedItems = foodWaste.reduce((total, item) => total + item.qty, 0);
  
    return (
      <div>
        <h3>Simulation Stats</h3>
        <ul>
          <li>Simulated Days: {simulatedDays}</li>
          <li>Simulated Time: {simulatedTime}</li>
          <li>Households: 31</li>
          <li>Robo Taxis Active: 5</li>
        </ul>
        <h3>Food Consumption</h3>
        <ul>
          <li>Daily consumption: {foodDailyConsumption}</li>
          <li>Total consumption: {foodTotalConsumption}</li>
        </ul>
        <h3>Recipe Consumption</h3>
        <ul>
          <li>Daily consumption: {recipeDailyConsumption}</li>
          <li>Total consumption: {recipeTotalConsumption}</li>
        </ul>
        <h4>Food Waste Overview</h4>
        <ul>
        <li>Total Stored Food: {totalStoredFood} / {totalFridgeCap}</li>
        <li>Total Surplus Food: {totalSurplus}</li>
        
        <button onClick={() => setIsFoodSurplusDropdownOpen(!isFoodSurplusDropdownOpen)}>
            {isFoodSurplusDropdownOpen ? 'Hide Surplus Details' : 'Show Surplus Details'}
        </button>
        {isFoodSurplusDropdownOpen && (
            <ul>
                {Object.entries(categorizedSurplus).map(([name, qty], index) => (
                    <li key={index}>{name}: {qty}</li>
                ))}
            </ul>
        )}

        <li>Total Wasted Food: {totalWastedItems}</li>
        <button onClick={() => setIsFoodWasteDropdownOpen(!isFoodWasteDropdownOpen)}>
            {isFoodWasteDropdownOpen ? 'Hide Food Waste Details' : 'Show Food Waste Details'}
        </button>
        {isFoodWasteDropdownOpen && (
            <ul>
            {foodWaste.map((item, index) => (
                <li key={index}>{item.name}: {item.qty}</li>
            ))}
            </ul>
        )}
        </ul>
      </div>
    );
}
Stats.propTypes = {
  token: PropTypes.string.isRequired,
};
export default Stats;