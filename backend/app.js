const express = require('express');
const cors = require('cors');
const OpenRouteService = require("openrouteservice-js");
const fs = require('fs');
const path = require('path');
const TaxiController = require('./controllers/taxiController');
const HouseholdController = require('./controllers/householdController');
const MissionController = require('./controllers/missionController');
const setTaxiAPIRoutes = require('./apiRoutes/setTaxiAPIRoute');
const setHouseholdAPIRoute = require('./apiRoutes/setHouseholdAPIRoute');
const setMissionControllerAPIRoute = require('./apiRoutes/setMissionControllerAPIRoute');
const logger = require('./utils/logger');
const authRoutes = require('./apiRoutes/auth');
const authenticate = require('./middleware/auth');

const ORS_API_KEY = "_OSR_API_KEY"; // Replace with your actual ORS API key
const ors = new OpenRouteService.Directions({ api_key: ORS_API_KEY });
const cacheFilePath = path.join(path.dirname(require.main.filename), 'cache', 'routes.json');
const cacheFilePathBackground = path.join(path.dirname(require.main.filename), 'cache', 'routesbackground.json');

const redisClient = require('./utils/redisClient');

const app = express();
const port = 2150;

// Enable CORS for all routes
app.use(cors({
    origin: 'http://localhost:3000'  // Allow only your frontend domain
  }));
app.use(express.json());

// Authentication routes
app.use('/auth', authRoutes);

// Protect all routes below this middleware
app.use(authenticate);

// Protect routes
/*
app.use('/protected', authenticate, (req, res) => {
    res.json({ message: 'This is a protected route' });
});
*/

let householdController;
let taxiController;
let missionController;
let cachedAllRoutes;

const initializeControllers = async () => {
    await redisClient.flushAll(); // reset redis

    householdController = new HouseholdController();
    setHouseholdAPIRoute(app, householdController);
    taxiController = new TaxiController(householdController);
    setTaxiAPIRoutes(app, taxiController);

    try {
        cachedAllRoutes = JSON.parse(fs.readFileSync(cacheFilePath, "utf8"));
        taxiController.moveAllTaxis();
    } catch (error) {
        logger.info('something went wrong with the route json file :( unable to establish predefined taxi routes', error);
    }

    missionController = new MissionController(householdController, taxiController, cachedAllRoutes);
    setMissionControllerAPIRoute(app, missionController);

    householdController.startSimulation();
};

// Initialize controllers on startup
initializeControllers();


/*
const moveTaxiPlus = () => {

    //if the routes , or route depending variable are not ready, skip
    // just to start all taxi engine
    if(!cachedAllRoutes){
        return;
    }
    taxiController.moveAllTaxis();
  };
  
const assignMission = () => {

    //if the routes , or route depending variable are not ready, skip
    if(!cachedAllRoutes){
        return;
    }
    misisonController.assignMissionToTaxi();
  };
*/

//start the program - lol wrong naming?
//turn off random assignment to develope the mission assignment
//setInterval(assignMission, 2** 60 * 60 * 1000 / config.timeMultiplier);

// 830ms realworld 30mph speed for a step of 0.0001 degree lat/lng , if it's 360x faster in simulation (1sec = 1 hour) , 30mph = 2.22 ms, taxis will be teleporting XD
//setInterval(moveTaxiPlus, 5); 
//moveTaxiPlus();


/*function to build cache routes*/

//simply plot a full background route that covers all households for visual effect
app.get("/fullroute", async (req, res) => {

    if(fs.existsSync(cacheFilePathBackground)){
    //if(false){
        const cachedBackgroundRoute = fs.readFileSync(cacheFilePathBackground, "utf8");
        res.json({ route: cachedBackgroundRoute });
    }else{
        try {
            // Calculate route using stored household data
            const routeResponse = await ors.calculate({
                coordinates: householdController.households.map(h => [h.lng, h.lat]),
                profile: "driving-car",
                format: "json"
            });

            const encodedPolyline = routeResponse.routes[0].geometry;

            // make sure cache directory exists
            if (!fs.existsSync(path.dirname(cacheFilePathBackground))) {
                fs.mkdirSync(path.dirname(cacheFilePathBackground), { recursive: true });
            }

            fs.writeFileSync(cacheFilePathBackground, encodedPolyline);
            logger.info(`Background Routes cached in ${cacheFilePathBackground}`);

            res.json({ route: encodedPolyline });
        } catch (error) {
            logger.error("Error fetching route:", error);
            res.status(500).json({ error: "Error fetching route" });
        }
    }

});

app.get("/gen-all-taxi-routes", (req, res) => {
    // we just need this once so commenting out now
    generateRoutes();
    res.json({ message: 'taxi route generated from ORS' });
  });


const generateRoutes = async () => {
    let routes = {};

    for (let i = 0; i < householdController.households.length; i++) {
        for (let j = i + 1; j < householdController.households.length; j++) {
            const start = householdController.households[i];
            const end = householdController.households[j];

            logger.info(`Fetching route: ${start.id} -> ${end.id}`);
            const routeData = await fetchRoute(start, end);
            if (routeData) {
                routes[`${start.id}-${end.id}`] = {
                    start: { id: start.id, lat: start.lat, lng: start.lng },
                    end: { id: end.id, lat: end.lat, lng: end.lng },
                    route: routeData.routes[0].geometry,
                    fullResponse: routeData
                };
            }
            logger.info(`Fetching route: ${end.id} -> ${start.id}`);
            const routeDataReverse = await fetchRoute(end, start);
            if (routeDataReverse) {
                routes[`${end.id}-${start.id}`] = {
                    start: { id: end.id, lat: end.lat, lng: end.lng },
                    end: { id: start.id, lat: start.lat, lng: start.lng },
                    route: routeData.routes[0].geometry,
                    fullResponse: routeData
                };   
            }
            //stay within 40 limit for free api key - 2 calls per 3 sec = 40 
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    // make sure cache directory exists
    if (!fs.existsSync(path.dirname(cacheFilePath))) {
        fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
    }

    fs.writeFileSync(cacheFilePath, JSON.stringify(routes, null, 2));
    logger.info(`Routes cached in ${cacheFilePath}`);
}

const fetchRoute = async (start, end) => {
    logger.info("fetching - form : ", [start.lng, start.lat], "to:", [end.lng, end.lat]);
    try {
        const response = await ors.calculate({
            coordinates: [[start.lng, start.lat], [end.lng, end.lat]],
            profile: "driving-car",
            format: "json"
        });
        return response;

    } catch (error) {
        logger.error(`Error fetching route from ${start.id} to ${end.id}:`, error.message);
        return null;
    }
}

app.post('/reset', async (req, res) => {
    try {
        await redisClient.flushAll();
        res.json({ message: 'simulation has been reset.' });
    } catch (error) {
        logger.error('Error resetting :', error);
        res.status(500).json({ error: 'Error resetting ' });
    }
});


// Start the server
const server = app.listen(port, () => {
    logger.info(`Server running at http://localhost:${port}`);
});

module.exports = server;

