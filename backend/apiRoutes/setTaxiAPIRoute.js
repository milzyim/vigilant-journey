function setTaxiAPIRoutes(app, taxiController) {
    app.get('/robo-taxi-status', taxiController.getAllTaxis.bind(taxiController));
    app.get('/robo-taxi-status/:id', taxiController.getTaxiById.bind(taxiController));
    app.post('/robo-taxi', taxiController.createTaxi.bind(taxiController));
}

module.exports = setTaxiAPIRoutes;