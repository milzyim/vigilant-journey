function setHouseholdAPIRoute(app, householdController) {
    app.get('/households', householdController.getAllHouseholds.bind(householdController));
    app.get('/households-fridge-details', householdController.getAllHouseholdsFridgeFoodDetails.bind(householdController));
    app.get('/households-food-count', householdController.getAllHouseholdsFoodCount.bind(householdController));
    app.get('/household/:id', householdController.getHouseholdById.bind(householdController));
    app.post('/household', householdController.createHousehold.bind(householdController));
    app.get('/foodwaste-overview', householdController.getDiscardedFoodCount.bind(householdController));
    app.get('/simulated-time-elpase', householdController.getSimulatedTime.bind(householdController));
    app.get('/total-consumption', householdController.getTotalConsumption.bind(householdController));
    app.get('/daily-consumption', householdController.getDailyConsumption.bind(householdController));
    app.get('/surplus-pool', householdController.getSurplusFoodTotal.bind(householdController));
    
}

module.exports = setHouseholdAPIRoute;