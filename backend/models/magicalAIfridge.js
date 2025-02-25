const Food = require('./food');
const redisClient = require('../utils/redisClient');



class MagicalAIFridge {
    constructor(householdId, fridgeId, capacity) {
        //this.foodItems = [];
        this.householdId = householdId; // ID of the household that owns the fridge
        this.capacity = capacity; // Maximum capacity of the fridge in liters
        this.id = `household:${householdId}:fridge`;
    }

    async addFood(food) {
        // we may want to implement from futuristic function of a firdge when a food is added?
        // probably to detect the weight and freshness of the food?
        // implementing Redis so we actually just storing food key in the fridge
        await redisClient.sAdd(this.id, food.id); // Store food ID inside a Set
        //logger.info(`Food ${food.id} added to fridge ${this.id}`);
        //this.foodItems.push(food);
    }

    async getAllFood() {
        const foodIds = await redisClient.sMembers(this.id);
        return foodIds; // Returns an array of food item IDs
    }

    async discardExpiredFood(currentDate) {
        const foodIds = await this.getAllFood(); // Get all food IDs in the fridge
        let expiredFood = [];
    
        for (const foodId of foodIds) {
            const foodData = await this.getFoodbyhouseholdId(this.householdId,foodId);
            if (!foodData) continue; // Skip missing entries
    
            const foodObj = JSON.parse(foodData);
            if (parseInt(foodObj.expiryDateTimeStamp) < currentDate) {
                expiredFood.push(foodObj);
                //await redisClient.sAdd(`household:${this.householdId}:discardedFood`, foodObj); // Store expired food ID in a separate set
                await redisClient.sRem(this.id, foodId); // Remove expired food ID from fridge
                await redisClient.del(foodId); // Delete food object from Redis
            }
        }
    
        return expiredFood; // Return list of expired food IDs
    }

    async getFoodCount() {
        //?? whos calling this ?
        const foodIds = await redisClient.sMembers(this.id); // Get all food IDs in the fridge
        const countMap = {};
    
        for (const foodId of foodIds) {
            const foodData = await this.getFoodbyhouseholdId(this.householdId,foodId);
            if (!foodData) continue; // Skip missing entries
    
            const foodObj = JSON.parse(foodData);
            countMap[foodObj.name] = (countMap[foodObj.name] || 0) + 1;
        }
    
        return countMap;
    }

    async removeFood(food) {
        //logger.info(`food:${this.householdId}:${food.id} is REMOVED`);
        await redisClient.sRem(this.id, food.id); // Remove food ID from the fridge set
        await Food.deleteFromRedis(`food:${this.householdId}:${food.id}`); // Delete food object from Redis
    }

    async getFoodbyhouseholdId(householdId, foodId){
        const foodData = await redisClient.get(`food:${householdId}:${foodId}`);
        return foodData;
    }
}

module.exports = MagicalAIFridge;