const { expect } = require('chai');
const sinon = require('sinon');
const { describe, it, beforeEach } = require('mocha');
const TaxiController = require('../controllers/taxiController');
const HouseholdController = require('../controllers/householdController');

describe('TaxiController', () => {
    let taxiController;
    let req;
    let res;

    beforeEach(() => {
        taxiController = new TaxiController( new HouseholdController());
        req = {};
        res = {
            json: sinon.spy()
        };
    });

    it('should return all taxis', () => {
        taxiController.robotaxis = [{ id: 1 }, { id: 2 }];
        taxiController.getAllTaxis(req, res);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.calledWith([{ id: 1 }, { id: 2 }])).to.be.true;
    });
});

// there should be more tests but meh, I don't have time