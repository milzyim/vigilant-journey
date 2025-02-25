const routes = require('../cache/routes.json');
const config = require('../config');
const redisClient = require('../utils/redisClient');
const logger = require('../utils/logger');

class Taxi {
    constructor(id, lat, lng, load, capacity, finalDestination, currentAtHousehold, route = [], onMove = false, routeColour) {
        this.id = id;
        this.lat = lat;
        this.lng = lng;
        this.load = load;
        this.capacity = capacity;
        this.finalDestination = finalDestination;
        this.currentAtHousehold = currentAtHousehold;
        this.route = route;
        this.onMove = onMove;
        this.routeColour = routeColour;
        this.batteryCapacity = 40; // 40 kWh battery
        this.batteryLevel = 32; // Start with a 80% 
        this.completedTrips = 0;
        this.cargo = {}; // Food items in the taxi
        this.isCharging = false; // inidicate it's charging when it stays in a charger
        this.onMissionType = undefined; // indicate it's on a mission type
        this.isExchaning = false; // indicate it's exchanging when it stays in a household
    }

    assignRoute(routeId) {
        this.routeId = routeId;
    }

    async move() {
        while (true) {
            await this.taxiGoLive();
            await new Promise(resolve => setTimeout(resolve, 828 / config.timeMultiplier)); // moving 0.0001 degree per tick, 828ms is around 1 mile at 40mph
        }
    }

    async taxiGoLive(){
        // Move the taxi to the next segment of the route
        // in fact taxi should have dynamic speed, but for simplicity we assume it moves at a constant speed for now?  probably 40 MPH

        if(this.batteryLevel <=0){
            //no battery left
            //logger.info(`Taxi ${this.id} is out of battery`);
            return;
        }

        if (this.route === undefined || this.route.length === 0 ) {
            //the route has been consumed - so taxi arrived at the destination 
            this.currentAtHousehold = this.finalDestination.household;
            this.lat = this.finalDestination.lat;
            this.lng = this.finalDestination.lng;
            this.onMove = false;
            //logger.info(`No route for taxi ${this.id}, waiting for new mission`);
            //actually this should be almost real time but, hm
            this.deductBattery();
            this.routeId = undefined;

            if(this.currentAtHousehold === 31 && !this.isCharging  && this.batteryLevel < this.batteryCapacity){ // yum yum I need charging
                this.startCharging();
            }
            // actually can insert a mini delay just like ischarging, too trival to add

            // ok so if taxi arrived at the destination WITH a mission, it needs to exhancge the goods
            // and return mission status
            // Handle mission exchange logic
            if (this.onMissionType === 'give') {
                await this.handleGiveMission();
            } else if (this.onMissionType === 'take') {
                await this.handleTakeMission();
            }

            return;
        }

        // Move taxi step by step
        const segment = this.route[0];
        const [start, end] = segment;
    
        // Move the taxi towards the end of the segment
        const distance = 0.0001; // Small step for simulation
        //const distance = 0.00087; //almost 40mph ?
    
        const latStep = end.lat > this.lat ? distance : -distance;
        const lngStep = end.lng > this.lng ? distance : -distance;
    
        this.lat += latStep;
        this.lng += lngStep;
    
        // if a taxi reaches the end of the segments, remove such segment
        if (Math.abs(this.lat - end.lat) < 0.0001 && Math.abs(this.lng - end.lng) < 0.0001) {
            this.route.shift(); // Remove the completed segment
        }
        this.onMove = true;
        
    }

    deductBattery() {
        if(this.routeId !== undefined){
            const routeDistance = this.getRouteDistance(); // Get the route distance in meters
            const distanceInMiles = routeDistance / 1609.34; // Convert meters to miles
            //const batteryUsed = (distanceInMiles / 200) * this.batteryCapacity; // Calculate battery used
            const batteryUsed = distanceInMiles / 3; // 3 miles per kWh lol battery used for the portable fridge module plus it's weight + contents weight?
            this.batteryLevel -= batteryUsed;
            if (this.batteryLevel < 0) this.batteryLevel = 0; // Ensure battery level doesn't go below 0
        }
    }

    getRouteDistance() {
        const route = routes[this.routeId];
        return route ? route.fullResponse.routes[0].summary.distance : 0;
    }

    getBatteryStatus() {
        return this.batteryLevel;
    }

    startCharging() {
        if (this.currentAtHousehold === 31 && !this.isCharging) { // yum yum charging
            this.isCharging = true;
            const chargingDuration = 2 * 60 * 60 * 1000 / config.timeMultiplier; // 2 hours in milliseconds adjusted by time multiplier
            const chargingInterval = chargingDuration / this.batteryCapacity; // Time to charge 1 kWh

            const chargingProcess = setInterval(() => {
                if (this.batteryLevel < this.batteryCapacity) {
                    this.isCharging = true;
                    this.batteryLevel += 1; // Increment battery level by 1 kWh
                    logger.info(`Taxi ${this.id} is charging. Battery level: ${this.batteryLevel} kWh`);
                    if(this.batteryLevel>=this.batteryCapacity){ // overflow?
                        this.batteryLevel=this.batteryCapacity
                    }
                } else {
                    clearInterval(chargingProcess); // Stop charging when battery is full
                    this.isCharging = false;
                    this.currentAtHousehold = undefined; // prevent to fall back into charging now
                    logger.info(`Taxi ${this.id} is fully charged.`); // tbh I wish to implement eventqueue - so when it's charged it will ask for mission
                }
            }, chargingInterval);
        }
    }

    async handleGiveMission() {
        /*const household = this.getHouseholdById(this.currentAtHousehold);*/
        this.isExchanging = true;
        if (!this.currentAtHousehold) {
            logger.error(`Household with ID ${this.currentAtHousehold} not found`);
            return;
        }

        // Collect food from the household
        const sharedFoodKey = `household:${this.currentAtHousehold}:sharedFood`;
        const fridgeFoodKey = `household:${this.currentAtHousehold}:fridge`; // every body got only 1 AI magical fridge for now
        const cargoKey = `taxi:${this.id}:cargo`;
        const sharedFood = await redisClient.sMembers(sharedFoodKey);

        let remainingCapacity = this.capacity - this.load;

        for (const foodId of sharedFood) {
            if (remainingCapacity <= 0) break;

            // Add food item to taxi's inventory
            if (!this.cargo[foodId]) {
                this.cargo[foodId] = 0;
            }
            this.cargo[foodId] += 1;
            this.load += 1;
            remainingCapacity -= 1;

            // Update cargo in Redis
            await redisClient.sAdd(cargoKey, foodId);
            // Remove food item from household's shared food
            await redisClient.sRem(sharedFoodKey, foodId);
            // Remove food item from household's fridge
            await redisClient.sRem(fridgeFoodKey, foodId);
        }

        // Update mission status
        const missionStatusKey = `household:${this.currentAtHousehold}:missionStatus:give`;
        if (remainingCapacity > 0) {
            await redisClient.del(missionStatusKey); // Clear the mission status if all food is collected
            //await redisClient.set(missionStatusKey, 'completed'); // Mark the mission status as 'completed'
            const missionId = await this.findMissionId(this.currentAtHousehold, 'give');
            if (missionId) {
                // Remove the mission entry from the MissionQueue
                await redisClient.xDel('missionQueue', missionId);
            }
            
        } else {
            await redisClient.set(missionStatusKey, 'pending'); // Set status to pending if not all food is collected
        }

        this.isExchanging = false;
        //logger.info(`Taxi ${this.id} completed 'give' mission at household ${this.currentAtHousehold}`);
    }

    async handleTakeMission() {
        this.isExchanging = true;
        if (!this.currentAtHousehold) {
            logger.error(`Household with ID ${this.currentAtHousehold} not found`);
            return;
        }

        const cargoKey = `taxi:${this.id}:cargo`;
        const fridgeFoodKey = `household:${this.currentAtHousehold}:fridge`; // every body got only 1 AI magical fridge for now
        const waitingListKey = `household:${this.currentAtHousehold}:acceptFood`;

        // Iterate through the food items in the taxi's cargo
        const cargoItems = await redisClient.sMembers(cargoKey);
        for (const foodId of cargoItems){
            //logger.info(`taxi ${this.id} processing ${foodId}`);
            const foodKeys = await redisClient.keys(`*:${foodId}`); 
            const foodKey = foodKeys[0];
            if(!foodKey){ continue;}
            let food = await redisClient.get(foodKey); // food id is unique - almost lol uuid v4
            food = JSON.parse(food);
            const isWaiting = await redisClient.hExists(waitingListKey, food.name);
            if (!isWaiting) continue;

            //const foodKey = `food:${this.currentAtHousehold}:${foodId}`;
            const newFoodKey = `food:${this.currentAtHousehold}:${foodId}`;

            // Remove the food item from the taxi's cargo
            await redisClient.sRem(cargoKey, foodId);

            // Update the food key to reflect the new receiving household
            //logger.info(`taxi:${this.id}:cargo - renaming ${foodKey} to ${newFoodKey}`);
            await redisClient.rename(foodKey, newFoodKey);

            // Add the food item to the receiving household's fridge
            await redisClient.sAdd(fridgeFoodKey, foodId);
            // Fetch the content of the food from the waiting list
            const foodContent = await redisClient.hGet(waitingListKey, food.name);
            //logger.info(`checking food ${food} from DB: ${foodContent}`);

            const foodData = JSON.parse(foodContent);
            // Deduct the quantity of the food item in the waiting list
            foodData.qty -= 1;

            // Update the waiting list with the new quantity
            if (foodData.qty > 0) {
                await redisClient.hSet(waitingListKey, food.name, JSON.stringify(foodData));
            } else {
                // Remove the food item from the household's waiting list if the quantity is zero
                await redisClient.hDel(waitingListKey, food.name);
            }
        }

        // Check if the waiting list is empty before removing the mission status
        const waitingListLength = await redisClient.hLen(waitingListKey);
        if (waitingListLength === 0) {
            const missionStatusKey = `household:${this.currentAtHousehold}:missionStatus:take`;
            await redisClient.del(missionStatusKey); // Clear the mission status if all food is collected
            //await redisClient.set(missionStatusKey, 'completed'); // Mark the mission status as 'completed'
            const missionId = await this.findMissionId(this.currentAtHousehold, 'take');
            if (missionId) {
                // Remove the mission entry from the MissionQueue
                await redisClient.xDel('missionQueue', missionId);
            }

        }
        this.isExchanging = false;
        //logger.info(`Taxi ${this.id} completed 'take' mission at household ${this.currentAtHousehold}`);
    }

    async findMissionId(householdId, missionType) {
        const result = await redisClient.xRange('missionQueue', '-', '+');
        for (const entry of result) {
            const id = entry.id;
            const message = entry.message;
            const mission = this.convertFieldsToObject(message);
            if (parseInt(mission.householdId) === householdId && mission.giveOrTake === missionType) {
                return id;
            }
        } 
        //can't find the mission ??
        return null;
    }

    convertFieldsToObject(fields) {
        const obj = {};
        const keys = Object.keys(fields);
        for (let i = 0; i < keys.length; i += 2) {
            const key = fields[keys[i]];
            const value = fields[keys[i + 1]];
            obj[key] = value;
        }
        return obj;
    }

}

module.exports = Taxi;