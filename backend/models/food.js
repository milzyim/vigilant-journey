const { v4: uuidv4 } = require('uuid');
const config = require('../config');
//trying to implement redis so that we don't explode memory due to too many food ?
const redisClient = require('../utils/redisClient');


class Food {
    constructor(name, category, freshness, expiryDate, weight, lock, belongsToHousehold) {
      this.id = uuidv4(); // Generate a unique ID for each food item
      this.belongsToHousehold = belongsToHousehold;
      this.name = name; // e.g., "Rice", "Bread", "Tomato"
      this.category = category; // e.g., "Grain", "Vegetable", "Meat"
      this.freshness = freshness;
      this.expiryDateTimeStamp = expiryDate; // Expiration timestamp
      this.weight = weight; // In grams?
      this.lock = lock;
    }
  
    async saveToRedis() {
        const key = `food:${this.belongsToHousehold}:${this.id}`;
        const value = JSON.stringify(this);
        await redisClient.set(key, value);
    }

    static async getFromRedis(id) {
        const key = `food:${this.belongsToHousehold}:${id}`;
        const value = await redisClient.get(key);
        if (value) {
            const obj = JSON.parse(value);
            return new Food(obj.name, obj.category, obj.freshness, obj.expiryDateTimeStamp, obj.weight, obj.lock);
        }
        return null;
    }

    static async deleteFromRedis(id) {
        //const key = `food:${this.belongsToHousehold}:${id}`;
        await redisClient.del(id);
    }

    static async isExpired(food, currentDateTimeStamp) {
        return currentDateTimeStamp > food.expiryDateTimeStamp;
    }

    static async isCloseToExpiry(food, currentDate) {
      const twoDay = 24 * 60 * 60 * 1000 * 3 / config.timeMultiplier;  // just make it three day to expire for now
      const timeleft = food.expiryDateTimeStamp - currentDate;
      const expired = await this.isExpired(food, currentDate);
      return timeleft <= twoDay && !expired;
  }

  }


module.exports = Food;