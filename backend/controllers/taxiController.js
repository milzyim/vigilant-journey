const Taxi = require('../models/taxi');

class TaxiController {
    constructor(householdController) {
        this.robotaxis = [
            new Taxi(1, 55.9533, -3.1883, 0, 80, { lat: householdController.households[0].lat, lng: householdController.households[0].lng, household: 1 }, 1, [], false, "rgb(33, 219, 0)"),
            new Taxi(2, 55.946589, -3.249442, 0, 80, { lat: householdController.households[30].lat, lng: householdController.households[30].lng, household: 31 }, 31, [], false, "rgb(255, 97, 89)"),
            new Taxi(3, 55.9539, -3.1843, 0, 80, { lat: householdController.households[23].lat, lng: householdController.households[23].lng, household: 24 }, 24, [], false, "rgb(255, 182, 74)"),
            new Taxi(4, 55.9350, -3.1400, 0, 80, { lat: householdController.households[9].lat, lng: householdController.households[9].lng, household: 10 }, 10, [], false, "rgb(7, 106, 204)"),
            new Taxi(5, 55.8700, -3.3100, 0, 80, { lat: householdController.households[25].lat, lng: householdController.households[25].lng, household: 26 }, 26, [], false, "rgb(186, 76, 223)")
        ];
        this.householdController = householdController;
    }

    getAllTaxis(req, res) {
        res.json(this.robotaxis);
    }

    getTaxiById(req, res) {
        const taxi = this.robotaxis.find(t => t.id === parseInt(req.params.id));
        if (taxi) {
            res.json(taxi);
        } else {
            res.status(404).send('Taxi not found');
        }
    }

    createTaxi(req, res) {
        const { id, lat, lng, load, capacity, finalDestination, currentAtHousehold, route, onMove, routeColour } = req.body;
        const newTaxi = new Taxi(id, lat, lng, load, capacity, finalDestination, currentAtHousehold, route, onMove, routeColour);
        this.robotaxis.push(newTaxi);
        res.status(201).json(newTaxi);
    }

    moveAllTaxis() {
        this.robotaxis.forEach(taxi => {
            if(taxi === undefined){
                return; //somehow taxis are not initiated?
            }
            taxi.move();
        });
    }


}

module.exports = TaxiController;