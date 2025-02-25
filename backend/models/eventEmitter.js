const EventEmitter = require('events');
const eventEmitter = new EventEmitter();

//simple event emitter to emit events to controllers, or to frontend
module.exports = eventEmitter;