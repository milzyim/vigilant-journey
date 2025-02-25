const polyline = require('polyline');
const redisClient = require('../utils/redisClient');
const config = require('../config');
const logger = require('../utils/logger');



class MissionController {

    constructor(householdController, taxiController, cachedAllRoutes) {
        this.taxiController = taxiController;
        this.householdController = householdController;
        this.cachedAllRoutes = cachedAllRoutes;
        this.chargingPoint = { id: 31, lat: 55.933882, lng: -3.406961}; // Static charging point
        this.minimumBatteryLevel = 8; // 8kwh 
        this.engageMissionManagement = false; // simple first come first serve
        this.engageAdvanceMissionManagement = true; // simply a switch to let the suggestion and taxi arrangement to kick in
        this.lastReadId = '0'; // Initialize the last read message ID
        this.taxiMissions = {}; // Dictionary to store missions for each taxi? probably something for later enhancement?
        this.missionCache = []; // Array to cache missions
        this.subscribeToMissions();
        this.processCachedMissions();
    }

    ////////////need to developement the logic of mission assignment and charging management
    //// also taking mission from household 

    async subscribeToMissions() {
        while (true) {
            try {
                const result = await redisClient.xRead(
                    [{ key: 'missionQueue', id: this.lastReadId }],
                    { block: 0, count: 1 }
                );

                if (result && result.length > 0) {
                    //const stream = result[0].name;
                    const messages = result[0].messages;
                    if (Array.isArray(messages) && messages.length > 0) {
                        for (const message of messages) {
                            const id = message.id;
                            const fields = message.message;
                            const mission = this.convertFieldsToObject(fields);
                            await this.processMission(mission);
                            this.lastReadId = id; // Update the last read message ID
                        }
                    } else {
                        logger.error('Unexpected format for messages:', messages);
                    }
                } 
            } catch (error) {
                logger.error('Error reading from Redis stream:', error);
            }

            // Add a delay between reads to reduce load
            await new Promise(resolve => setTimeout(resolve, 1000/config.timeMultiplier));
        }
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

    async processMission(mission) {
        //this is being MADE simple as in we have precomputed routes - we could use these data to simply greedly assign the missions to the nearest taxi
        //but in real world traffic this would be something to involve ML/AI to optimize the assignment
        //no knownledge about that yet

        //logger.info(`Processing mission: ${JSON.stringify(mission)}`);
        if (this.engageAdvanceMissionManagement) {
            const idleTaxis = await this.findIdleTaxis();

            if (idleTaxis.length > 0) {
                if (mission.giveOrTake === 'give') {
                    const closestTaxi = this.findClosestTaxi(idleTaxis, mission.householdId);
                    if (closestTaxi) {
                        logger.info('Assigning "give" mission to taxi:', closestTaxi.id);
                        await this.assignGiveMissionToTaxi(closestTaxi, mission);
                    } else {
                        logger.info('No suitable taxi found for the mission.');
                    }
                } else if (mission.giveOrTake === 'take') {
                    await this.assignTakeMissionToTaxis(idleTaxis, mission);
                } else {
                    logger.info('Unhandled mission type:', mission.giveOrTake);
                }
            } else {
                //logger.info('No idle taxi available. Mission will be queued.');
                this.cacheMission(mission);
            }

        } 
    }

    cacheMission(mission) {
        this.missionCache.push(mission);
    }

    async processCachedMissions() {
        setInterval(async () => {
            if (this.missionCache.length > 0) {
                //logger.info('Processing cached missions...');
                const idleTaxis = await this.findIdleTaxis();

                if (idleTaxis.length > 0) {
                    const missionsToProcess = [...this.missionCache];
                    this.missionCache = [];

                    for (const mission of missionsToProcess) {
                        await this.processMission(mission);
                    }
                }
            }else{
                this.lastReadId = '0'; // restart the process
                if(!this.engageAdvanceMissionManagement){
                    //logger.info(`Assigning mission to taxi: ${JSON.stringify(mission)}`);
                    this.assignRandomMissionToTaxis();
                }

            }
        }, 60000/config.timeMultiplier); // Check every minute
    }

    async assignGiveMissionToTaxi(taxi, mission) {

        const household = this.householdController.households.find(h => h.id === parseInt(mission.householdId));
        if (!household) {
            logger.error(`Household with ID ${mission.householdId} not found`);
            return;
        }
        const missionStatusKey = `household:${household.id}:missionStatus:give`;
        await redisClient.set(missionStatusKey, 'processing'); // stop the household to send another mission

        if(this.checkBatterySufficiency(taxi, household)){
            taxi.onMissionType = 'give'; // to pick up household give mission
            taxi = await this.updateTaxiFinalDestination(taxi, household);
        }else{
            //send it to charging
            // turns out the taxi has no sufficient battery, needs to reassign?
            logger.info(`taxi ${taxi.id} is low on battery, sending to charging point`);
            taxi.onMissionType = 'charging';
            taxi = await this.updateTaxiFinalDestination(taxi, this.chargingPoint);
        }

        taxi = await this.routeTaxi(taxi);
        //taxi will move it self

        logger.info(`Assigned 'give' mission to taxi ${taxi.id}: ${JSON.stringify(mission)}`);
    }

    async assignTakeMissionToTaxis(idleTaxis, mission) {
        const household = this.householdController.households.find(h => h.id === parseInt(mission.householdId));
        if (!household) {
            logger.error(`Household with ID ${mission.householdId} not found`);
            return;
        }

        const waitingListKey = `household:${household.id}:acceptFood`;
        //const requiredItems = await redisClient.hGetAll(waitingListKey);

        for (let taxi of idleTaxis) {
            const cargoKey = `taxi:${taxi.id}:cargo`;
            const cargoItems = await redisClient.sMembers(cargoKey);
            let hasRequiredItems = false;
            for (const foodId of cargoItems){
                const foodKeys = await redisClient.keys(`*:${foodId}`); 
                const foodKey = foodKeys[0];
                //logger.info(`[Mission Control] taxi:${taxi.id}:cargo getting foodkey: ${foodKey}`);
                if(!foodKey){ // edge case again 
                    continue;
                }
                let food = await redisClient.get(foodKey); // food id is unique - almost lol uuid v4
                //logger.info(`[Mission Control] taxi:${taxi.id}:cargo food item from db: ${food}`);
                if(!food){ 
                    // an edge case somehow the taxi is working with the exchange - the food get transitioned into new household
                    //should update taxi.isExchanging to blosk it from idle detection
                    continue;
                }
                food = await JSON.parse(food);
                const isWaiting = await redisClient.hExists(waitingListKey, food.name);
                if (!isWaiting){ 
                    continue;
                }else{
                    hasRequiredItems = true;
                    break;
                }
            }

            if (hasRequiredItems) {
                const missionStatusKey = `household:${household.id}:missionStatus:take`;
                await redisClient.set(missionStatusKey, 'processing'); // stop the household to send another mission

                taxi.onMissionType = 'take'; // to pick up household give mission
                taxi = await this.updateTaxiFinalDestination(taxi, household);
                taxi = await this.routeTaxi(taxi);

                logger.info(`Assigned 'take' mission to taxi ${taxi.id}: ${JSON.stringify(mission)}`);
            }
        }
    }

    async updateTaxiFinalDestination(taxi, household){
        taxi.finalDestination = {
            household: household.id,
            lat: household.lat,
            lng: household.lng
        };

        return taxi;
    }

    async findIdleTaxis() {
        // Return all idle taxis (not moving, not charging, not exchanging)
        return this.taxiController.robotaxis.filter(taxi => !taxi.onMove && !taxi.isCharging && !taxi.isExchanging);
    }

    findClosestTaxi(idleTaxis, destinationHouseholdId) {
        let closestTaxi = null;
        let shortestDistance = Infinity;
    
        for (const taxi of idleTaxis) {
            const routeKey = `${taxi.currentAtHousehold}-${destinationHouseholdId}`;
            const route = this.cachedAllRoutes[routeKey];
    
            if (route) {
                const distance = route.fullResponse.routes[0].summary.distance;
                if (distance < shortestDistance) {
                    shortestDistance = distance;
                    closestTaxi = taxi;
                }
            } else {
                logger.error(`Route not found in cache for key: ${routeKey}`);
            }
        }
    
        return closestTaxi;
    }

    async toggleAdvancedMissionManagement(req, res) {
        const { enable } = req.body;
        this.engageAdvanceMissionManagement = enable;
        res.json({ message: `Advanced mission management ${enable ? 'enabled' : 'disabled'}.` });
    }

    /*-------------------------old random crazy teleporting taxis just for animation ---------------------------*/
    
    assignMissionToTaxi() {
        this.assignRandomMissionToTaxis();
    }

    assignRandomMissionToTaxis() {
        this.taxiController.robotaxis = this.taxiController.robotaxis.map(taxi => {
            if ((taxi.route === undefined || taxi.route.length === 0 ) && taxi.isCharging === false) {
                // taxi completed trip +1
                taxi.completedTrips++;
                //the route has been consumed
                taxi.currentAtHousehold = taxi.finalDestination.household;
                taxi.lat = taxi.finalDestination.lat;
                taxi.lng = taxi.finalDestination.lng;
                taxi.onMove = false;
                logger.info(`No route for taxi ${taxi.id}, assigning new mission`);
                this.assignRandomMisisontoTaxi(taxi);
            }
            return taxi;
        });
    }

    async assignRandomMisisontoTaxi(taxi){
        if(taxi.onMove === false && taxi.isCharging === false && taxi.isExchaning === false) {
            //so it has stopped
            if(taxi.currentAtHousehold === taxi.finalDestination.household && taxi.currentAtHousehold !== this.chargingPoint.id){  
                logger.info(`taxi ${taxi.id} has arrived at household ${taxi.currentAtHousehold}`);
               //and arrived destination
               let newHouseHoldToGo = await this.getRandomDestination(taxi, this.householdController.households);
               //so when a new destination is obtained, 
               // we need to check the current battery is sufficient for the next possible charging trip
                if(this.checkBatterySufficiency(taxi, newHouseHoldToGo)){
                    taxi = await this.updateTaxiFinalDestination(taxi, newHouseHoldToGo);

                }else{
                    //send it to charging
                    logger.info(`taxi ${taxi.id} is low on battery, sending to charging point`);
                    taxi = await this.updateTaxiFinalDestination(taxi, this.chargingPoint);

                }
               //assing new route !
               taxi.onMissionType = 'taxi service';
               taxi = await this.routeTaxi(taxi);
            }else{
               // why it stopeeddd?
               // it could be due to a pre defined route has issue , and the taxi needs a new mission? or it could be stranded due to out of battery
               logger.info(`taxi ${taxi.id} is stuck so we re-assgining another mission`);
               let newHouseHoldToGo = await this.getRandomDestination(taxi, this.householdController.households);
               taxi = await this.updateTaxiFinalDestination(taxi, newHouseHoldToGo);
               /*taxi.finalDestination.household = newHouseHoldToGo.id;  
               taxi.finalDestination.lat = newHouseHoldToGo.lat;
               taxi.finalDestination.lng = newHouseHoldToGo.lng;*/
               //taxi = await this.routeTaxi(taxi);
               taxi.onMissionType = undefined; // randomly moving to unstuck
               taxi = await this.routeTaxi(taxi);
            }
            
        }
        // If the taxi is still moving, monitor the battery level and decide if it needs a detour to the charging point
        else if (taxi.onMove && taxi.batteryLevel < this.minimumBatteryLevel) {
            logger.info(`Taxi ${taxi.id} is moving but low on battery, sending to charging point`);
            taxi.finalDestination.household = this.chargingPoint.id;
            taxi.finalDestination.lat = this.chargingPoint.lat;
            taxi.finalDestination.lng = this.chargingPoint.lng;
            // Assign new route to charging point
            taxi.onMissionType = 'charging';
            taxi = await this.routeTaxi(taxi);
        }
        //still moving so let it move, but somehow we may want to live monitor the battery level and decide it needs detour to charging point?
        return taxi;
    };

    async routeTaxi(taxi){

        //edge case, a taxi is being ask to go from where it sit
        if (taxi.currentAtHousehold === taxi.finalDestination.household){
            //trigger arrived action
            taxi.route = undefined;
            return taxi;
        }

        // tidy up the key then read the route 
        // give the taxi a new route
        let routekey = taxi.currentAtHousehold + "-" + taxi.finalDestination.household;
        //routekey = '3-20'; //debug
        logger.info(`getting route ${routekey}`);
    
        //const newroute = cachedAllRoutes[routekey].routeDecoded;
        const newroute = await this.splitRouteIntoSegments(polyline.decode(this.cachedAllRoutes[routekey].route));
        
        if(newroute[0] === undefined || newroute === undefined){ //??? this look stupid
            //a route should at least has 2 segment
            //somehow the route cache is broken
            //this is an invalid route, reassign
            logger.info(`empty route detected - rerouting`);
            // let taxi be stalled for now 
            return taxi;
            //return this.assignNewMisisontoTaxi(taxi);
        }
        //logic to consider battery

        taxi.assignRoute(routekey);
        //funny bug that the route for eg 2-22 is the same as 22-2, it depends on the direction
        //laughed with my kid for an hour as the taxi going crazy of reversring movement
        if(taxi.finalDestination.household > taxi.currentAtHousehold){
            taxi.route = newroute;
        }else{
            taxi.route = newroute.reverse();
        }    
        taxi.lat = newroute[0][0].lat; // Start latitude
        taxi.lng = newroute[0][0].lng; // Start longitude*/
        taxi.currentRouteIndex = 0; // Ensure it starts at the beginning of the route
    
        
        taxi.encodedRoute = this.cachedAllRoutes[routekey].route;
        return taxi;
    };
    
    async getRandomDestination(taxi, households){
        // filter out the current location
        const currentAtHousehold = taxi.currentAtHousehold;
        const possibleDestinations = households.filter(h => h.id !== currentAtHousehold && h.id !== 31); // 31-31 will kill the controller lol
        // randomly pick one
        const newDestination = possibleDestinations[Math.floor(Math.random() * possibleDestinations.length)];
        logger.info(`[Mission control] Taxi - ${taxi.id}, please go to household ${newDestination.id}`);
        return newDestination;
    }

    // split the route into segments (pairs of consecutive points)
    async splitRouteIntoSegments(routeCoords){
        let segments = [];
        for (let i = 0; i < routeCoords.length - 1; i++) {
            segments.push([
                { lat: routeCoords[i][0], lng: routeCoords[i][1] },  // Convert to object
                { lat: routeCoords[i + 1][0], lng: routeCoords[i + 1][1] }
            ]);
        }
        //logger.info("Segments:", segments);
        return segments;
    };

    checkBatterySufficiency(taxi, destination){
        //simple check if the taxi has enough battery for a new mission + consecutive trip to charging, if not, send it to charging

        logger.info(`checking route for ${taxi.currentAtHousehold}-${destination.id} + ${destination.id}-${this.chargingPoint.id}`);
        const routoFromCurrentLocationToMissionDestination = this.cachedAllRoutes[taxi.currentAtHousehold + "-" + destination.id];
        const routoFromMissionDestinationToCharginPoint = this.cachedAllRoutes[destination.id+ "-" + this.chargingPoint.id];

        const routeDistanceToDestination = routoFromCurrentLocationToMissionDestination.fullResponse.routes[0].summary.distance;
        const routeDistanceToChargingPoint = routoFromMissionDestinationToCharginPoint.fullResponse.routes[0].summary.distance;

        const totalDistance = routeDistanceToDestination + routeDistanceToChargingPoint;
        const distanceInMiles = totalDistance / 1609.34; // Convert meters to miles
        const batteryNeeded = distanceInMiles / 3; // 3 miles per kWh

        if (taxi.batteryLevel >= batteryNeeded + 10) { // let limit 10kwh for safty, there are overshoot happening when iteration up to 200 days
            return true;
        } else {
            return false;
        }

    }

}

module.exports = MissionController;