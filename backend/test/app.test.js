const request = require('supertest');
//const express = require('express');
const app = require('../app'); // Assuming app.js exports the Express app
const { describe, it } = require('mocha'); // Add this line if using Mocha
const { expect } = require('chai'); // Add this line to import expect from Chai
// or
// const { describe, it } = require('jest'); // Add this line if using Jest

describe('POST /toggle-advanced-mission-management', () => {
    it('should toggle advanced mission management', async () => {
        const res = await request(app)
            .post('/toggle-advanced-mission-management')
            .send({ enable: true });

        expect(res.status).to.equal(200);
        expect(res.body.message).to.equal('Advanced mission management enabled.');
    });
});