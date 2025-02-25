const Household = require('../models/household');
const logger = require('../utils/logger');
const config = require('../config');
const redisClient = require('../utils/redisClient');

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

class HouseholdController {

    constructor() {
        const locations = [
            { lat: 55.9533, lng: -3.1883 }, // Edinburgh location
            { lat: 55.9538, lng: -3.1845 }, // Another location 
            { lat: 55.9370, lng: -3.2500 }, // Closer to roads, more spread
            { lat: 55.9375, lng: -3.2000 }, // Closer to roads, more spread
            { lat: 55.9300, lng: -3.1800 }, // Closer to roads, more spread
            { lat: 55.9200, lng: -3.1500 }, // Closer to roads, more spread
            { lat: 55.9100, lng: -3.1800 }, // Random placement, more spread
            { lat: 55.9700, lng: -3.2000 }, // Random placement
            { lat: 55.9400, lng: -3.2800 }, // Random placement
            { lat: 55.9500, lng: -3.1200 }, // Random placement
            { lat: 55.9600, lng: -3.2500 }, // Random placement
            { lat: 55.9200, lng: -3.2200 }, // Random placement
            { lat: 55.9350, lng: -3.1400 }, // Closer to roads, more spread
            { lat: 55.9500, lng: -3.1800 }, // Random placement
            { lat: 55.9700, lng: -3.2712 }, // Random placement
            { lat: 55.9620, lng: -3.1600 }, // Random placement
            { lat: 55.9400, lng: -3.1900 }, // Closer to roads
            { lat: 55.9600, lng: -3.2100 }, // Random placement
            { lat: 55.9300, lng: -3.1700 }, // Closer to roads
            { lat: 55.9602, lng: -3.2502 }, // Random placement
            { lat: 55.9543, lng: -3.1893 }, // Example: Edinburgh location 
            { lat: 55.9544, lng: -3.1862 }, // Another location
            { lat: 55.9534, lng: -3.1881 }, // Edinburgh location
            { lat: 55.9539, lng: -3.1843 }, // Another location
            { lat: 55.9150, lng: -3.2500 }, // Between cities
            { lat: 55.8700, lng: -3.3100 }, // Between cities
            { lat: 55.9400, lng: -3.3250 }, // Closer to Glasgow
            { lat: 55.9050, lng: -3.2200 }, // Random placement
            { lat: 55.9200, lng: -3.3000 }, // Random placement
            { lat: 55.8900, lng: -3.2800 },  // Closer to roads
            { lat: 55.933882, lng: -3.406961} // TESLA SUPER CHARGERRRR id = 31
        ];

        this.households = [];

        for (let i = 0; i < locations.length; i++) {
            const { lat, lng } = locations[i];
            const randomWealthLevel = getRandomInt(10, 100);
            let fridgeCap = randomWealthLevel * getRandomInt(5, 10);
            fridgeCap = Math.max(50, Math.min(fridgeCap, 500)); // Ensure fridgeCap is between 50 and 500L  - so from office fridge to a big family fridge
            const label = (i == locations.length-1) ? 'Superrrr Chargerrrr': `Household ${i + 1}`;
            const household = new Household(
                i + 1,
                label,
                lat,
                lng,
                randomWealthLevel,
                fridgeCap
            );
            this.households.push(household);
        }
        this.households.push(new Household(32, 'Household 32 - USER', 55.946589, -3.249442, 100, 500)); // total 32 household

        this.recipes = require('../cache/recipes.json');

        // Initialize the number of simulated days
        this.simulatedDays = 0;
        this.simulatedTime = '00:00';

        this.foodDecisionMade = false; // reset the day
        this.shoppingforDayDone = false; // reset the day
        this.callForDinner = false; // reset the day

        //receives event from households: well what to do with this ? pub/sub ? queuing?
        //eventEmitter.on('foodShared', this.handleFoodShared.bind(this));

        /*probably better to have same varible orther than creating new one when receives API call*/
        this.simplifiedHouseholds;
        this.householdsFridgeFulDetails;
        this.householdsFoodCount;
        this.totalFoodCount; 
        this.totalFridgeCap;
        this.discardedFoodArray;  
        this.totalConsumption;
        this.dailyConsumption;
        this.surplusFoodPool = [];

    }

    async getAllHouseholds(req, res) {
        this.simplifiedHouseholds = this.households.map(household => ({
            id: household.id,
            name: household.name,
            lat: household.lat,
            lng: household.lng,
            wealth: household.wealthLevel
        }));
        res.json(this.simplifiedHouseholds);
    }

    async getAllHouseholdsFridgeFoodDetails(req, res) {
        this.householdsFridgeFulDetails = this.households.map(household => ({
            id: household.id,
            name: household.name,
            fridge: household.magicalAIFridge
        }));
        res.json(this.householdsFridgeFulDetails);
    }

    async getAllHouseholdsFoodCount(req, res) {
        this.totalFoodCount = 0;
        this.totalFridgeCap = 0;
        this.householdsFoodCount = [];

        for (const household of this.households) {
            const foodIds = await redisClient.sMembers(`household:${household.id}:fridge`); // Get all food IDs in the fridge
            const foodCount = {};

            // Fetch food details for each ID from Redis
            for (const foodId of foodIds) {
                const foodData = await this.getFoodbyhouseholdId(household.id, foodId);
                if (foodData) {
                    const foodObj = JSON.parse(foodData);
                    foodCount[foodObj.name] = (foodCount[foodObj.name] || 0) + 1;
                }
            }

            const foodCountArray = Object.keys(foodCount).map(foodName => ({
                food: foodName,
                qty: foodCount[foodName]
            }));

            this.householdsFoodCount.push({
                id: household.id,
                name: household.name,
                fridge: foodCountArray
            });

            this.totalFoodCount += foodIds.length;
            this.totalFridgeCap += household.magicalAIFridge.capacity;
        }

        res.json({details: this.householdsFoodCount, total: this.totalFoodCount, totalCap: this.totalFridgeCap});
    }

    async getDiscardedFoodCount(req, res) {
        this.totalDiscardedFoodCount = 0;
        this.householdsDiscardedFoodCount = [];
        const discardedFoodMap = {};

        for (const household of this.households) {
            const discardedFoodKey = `household:${household.id}:discardedFood`;
            const discardedFoodCount = await redisClient.hGetAll(discardedFoodKey); // Get all discarded food counts

            const householdDiscardedFoodArray = Object.keys(discardedFoodCount).map(foodName => ({
                name: foodName,
                qty: parseInt(discardedFoodCount[foodName], 10)
            }));

            this.householdsDiscardedFoodCount.push({
                id: household.id,
                name: household.name,
                discardedFood: householdDiscardedFoodArray
            });

            for (const { name, qty } of householdDiscardedFoodArray) {
                if (!discardedFoodMap[name]) {
                    discardedFoodMap[name] = 0;
                }
                discardedFoodMap[name] += qty;
            }

            this.totalDiscardedFoodCount += Object.values(discardedFoodCount).reduce((sum, qty) => sum + parseInt(qty, 10), 0);
        }

        this.discardedFoodArray = Object.keys(discardedFoodMap).map(foodName => ({
            name: foodName,
            qty: discardedFoodMap[foodName]
        }));

        res.json({
            categorized_discarded_food: this.discardedFoodArray,
            total_discarded_food_count: this.totalDiscardedFoodCount
        });
        //res.json({ details: this.householdsDiscardedFoodCount, total: this.totalDiscardedFoodCount });
    }

    async getTotalConsumption(req, res) {
        this.totalConsumption = this.households.reduce((totals, household) => {
            totals.recipes += household.totalConsumedRecipes;
            Object.keys(household.totalConsumedFood).forEach(foodName => {
                totals.food[foodName] = (totals.food[foodName] || 0) + household.totalConsumedFood[foodName];
                totals.food['total'] = (totals.food['total'] || 0) + household.totalConsumedFood[foodName];
            });
            return totals;
        }, { recipes: 0, food: {} });

        res.json(this.totalConsumption);
    }

    async getDailyConsumption(req, res) {
        this.dailyConsumption = this.households.reduce((totals, household) => {
            totals.recipes += household.dailyConsumedRecipes;
            Object.keys(household.dailyConsumedFood).forEach(foodName => {
                totals.food[foodName] = (totals.food[foodName] || 0) + household.dailyConsumedFood[foodName];
                totals.food['total'] = (totals.food['total'] || 0) + household.dailyConsumedFood[foodName];
            });

            return totals;
        }, { recipes: 0, food: {} });

        res.json(this.dailyConsumption);
    }

    resetDailyConsumption() {
        this.households.forEach(household => {
            household.dailyConsumedRecipes = 0;
            household.dailyConsumedFood = {total:0};
        });
    }

    resetDailyDecisions() {
        this.households.forEach(household => {
            household.foodDecisionMade = false; // reset the day
            household.shoppingforDayDone = false; // reset the day
            household.callForDinner = false; // reset the day
        });
    }

    getHouseholdById(req, res) {
        const household = this.households.find(t => t.id === parseInt(req.params.id));
        if (household) {
            res.json(household);
        } else {
            res.status(404).send('household not found');
        }
    }

    // something to hammer the simulation?
    createHousehold(req, res) {
        const { id, lat, lng, load, capacity, finalDestination, currentAtHousehold, route, onMove, routeColour } = req.body;
        const newhousehold = new Household(id, lat, lng, load, capacity, finalDestination, currentAtHousehold, route, onMove, routeColour);
        this.households.push(newhousehold);
        res.status(201).json(newhousehold);
    }

    getSimulatedTime(req, res){
        res.json({simulatedDays: this.simulatedDays, currentTimeinDay: this.simulatedTime});
    }

    startSimulation() {
        this.simulationStartTime = Date.now(); // Record the start time of the simulation
        this.simulationClock = Date.now(); // Record the start time of the simulation
        // Run simulateDay every minute
        setInterval(() => {
            this.simulateDay();
        }, 1 * 1000); // 1 seconds
        //}, 10 * 1000); // 10 seconds
    }

    simulateDay() {

        const elapsedSeconds =  Math.floor((Date.now() - this.simulationClock) / 1000 ) * config.timeMultiplier; // Calculate elapsed second
 
        const currentHour = Math.floor(elapsedSeconds  / 3600) % 24;
        const currentMinute = Math.floor((elapsedSeconds % 3600) / 60);


        //logger.info(`Current time: ${currentHour}:${currentMinute < 10 ? '0' : ''}${currentMinute}`);
        this.simulatedTime = `${currentHour}:${currentMinute < 10 ? '0' : ''}${currentMinute}`;

        // Increment the number of simulated days if a new day starts
        if (currentHour === 0 && currentMinute === 0 && elapsedSeconds > 0) { //elapsedHour could overflow 
            this.simulationClock = Date.now();
            this.simulatedDays++;

            this.resetDailyConsumption(); // Reset daily consumption at the start of a new day
            this.resetDailyDecisions();
            logger.info(`Simulated days passed: ${this.simulatedDays}`);
        }


        this.households.forEach(async household => {
            if (household.id === 31 || household.id === 32) return; // Skip the user's household , and SUPPERRR CHARGERRR

            // Impulsive purchase food
            //should improve this to purchasing only once or twice per week
            if (currentHour >= 12 && currentHour <= 18 && !household.shoppingforDayDone) { // Between 5 PM and 10 PM
                if (Math.random() < household.wealthLevel / 300){ // lesser rate as they're buying too much
                    //logger.info(`Hosuehold ${household.id} decided to go shopping`);
                    household.impulsiveGroceryShopping();
                }
                household.shoppingforDayDone = true;
            }
            // Decide what to do with recipe
            if (currentHour >= 7 && currentHour <= 16) {
                //this is spamming the household with recipe lol
                if(household.toNightsRecipe === undefined){
                    //const recipe = this.getRandomRecipe(); // Assuming you have a method to get a random recipe
                    const recipe = await this.getRecipeBasedOnSurplus();
                    household.suggestRecipe(recipe);
                }
            }

            // Decide what to do with food
            if (currentHour >= 7 && currentHour <= 16 && !household.foodDecisionMade) {
                household.foodDecisionMade = true;
                household.decideWhatToDoWithFood();
            }

            // Consume food for recipe
            //if (currentHour >= 17 && currentHour <= 22 && Math.random() < 0.6 && !this.callForDinner){
            if (currentHour >= 17 && !household.callForDinner){
                // Between 5 PM and 10 PM , actually should add probability whether the household would cook, as people doesn't really eating on time?
                household.callForDinner = true;
                household.consumeFoodForRecipe();
            }
        });
    }

    getRandomRecipe() {
        const randomIndex = getRandomInt(0, this.recipes.length - 1);
        return this.recipes[randomIndex];
    }

    async getSurplusFoodPool() {
        const surplusFoodPool = {};
        for (const household of this.households) {
            const sharedFoodKey = `household:${household.id}:sharedFood`;
            const sharedFoodIds = await redisClient.sMembers(sharedFoodKey); // Get all shared food IDs

            for (const foodId of sharedFoodIds) {
                const foodData = await this.getFoodbyhouseholdId(household.id, foodId);
                if (foodData) {
                    const foodObj = JSON.parse(foodData);
                    if (!surplusFoodPool[foodObj.name]) {
                        surplusFoodPool[foodObj.name] = 0;
                    }
                    surplusFoodPool[foodObj.name] += 1;
                }
            }
        }
        return surplusFoodPool;
    }

    async getRecipeBasedOnSurplus() {
        const surplusFoodPool = await this.getSurplusFoodPool();
        const surplusFoodItems = Object.keys(surplusFoodPool);
        const matchingRecipes = this.recipes.filter(recipe => {
            return recipe.ingredients.some(ingredient => surplusFoodItems.includes(ingredient.name));
        });

        if (matchingRecipes.length > 0) {
            const randomIndex = this.getRandomInt(0, matchingRecipes.length - 1);
            return matchingRecipes[randomIndex];
        } else {
            return this.getRandomRecipe();
        }
    }

    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    handleFoodShared({ householdId, food }) {
        logger.info(`Household ${householdId} shared ${food.name}`);
        this.surplusFoodPool.push(food);
        // Implement logic to handle shared food
        // For example, add the shared food to a shared pool or notify other households
    }

    async getSurplusFoodTotal(req, res) {
        let totalSurplusFood = 0;
        const categorizedFoodTotals = {};
    
        for (const household of this.households) {
            const sharedFoodKey = `household:${household.id}:sharedFood`;
            const sharedFoodIds = await redisClient.sMembers(sharedFoodKey); // Get all shared food IDs
    
            for (const foodId of sharedFoodIds) {
                //const foodKey = `food:${household.id}:${foodId}`;
                const foodData = await this.getFoodbyhouseholdId(household.id, foodId);
                if (foodData) {
                    const foodObj = JSON.parse(foodData);
                    totalSurplusFood += 1;
                    if (!categorizedFoodTotals[foodObj.name]) {
                        categorizedFoodTotals[foodObj.name] = 0;
                    }
                    categorizedFoodTotals[foodObj.name] += 1;
                }
            }
        }
    
        res.json({ totalSurplusFood: totalSurplusFood, categorizedFoodTotals:categorizedFoodTotals});
    }


    async getFoodbyhouseholdId(housedolId, foodId){
        const foodData = await redisClient.get(`food:${housedolId}:${foodId}`);
        return foodData;
    }

}

module.exports = HouseholdController;