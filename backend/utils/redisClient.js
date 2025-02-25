const redis = require('redis');
const logger = require('../utils/logger');

const client = redis.createClient({
  socket: {
    host: '127.0.0.1', // Match your Docker setup
    port: 6800,        // Port mapped to Redis container
  }
});

// Connect immediately when the app starts
client.connect()
  .then(() => logger.info('Connected to Redis--------------------------------------------------------------------------'))
  .catch(err => logger.error('Redis Connection Error:', err));

// Handle errors to prevent crashes
client.on('error', (err) => {
  logger.error('🚨 Redis Error:', err);
});

module.exports = client; // Export the same client instance