const Food = require('./food'); // Ensure you have a Food class defined
const foodTypes = require('../cache/foodTypes.json'); // Load food types
const Recipe = require('./recipe'); // Ensure you have a Recipe class defined
const MagicalAIFridge = require('./magicalAIfridge');
// was thinking to use eventEmitter to handle the food sharing, but here we have a redis so let's try redis stream
// QM like rabbitMQ or Kafka are overkill :p
//const eventEmitter = require('./eventEmitter');
const config = require('../config');
const redisClient = require('../utils/redisClient');
const logger = require('../utils/logger');

class Household {
    
    constructor(id, name, lat, lng, wealthLevel, fridgeCapacity) {
        this.id = id;
        this.name = name;
        this.lat = lat;
        this.lng = lng;
        this.wealthLevel = wealthLevel; // "rich", "middle", "poor"
        this.magicalAIFridge = new MagicalAIFridge(id, 1, fridgeCapacity);  // assuming each household has only 1 fridge for now lol
        /*this.magicalAIFridge = [];
        this.fridgeCapacity = fridgeCapacity; // Maximum capacity of the fridge in liters*/
        this.toNightsRecipe = undefined;
        this.sharedFood = []; // Track shared food items
        this.discardedFood = {}; // Track discarded food
        this.waitingForDelivery = new Map(); // Track waiting food items and their timeouts
        this.foodDecisionMade = false; // reset the day
        this.shoppingforDayDone = false; // reset the day
        this.callForDinner = false; // reset the day
        this.dailyConsumedRecipes = 0; // Track daily consumed recipes
        this.totalConsumedRecipes = 0; // Track total consumed recipes
        this.dailyConsumedFood = {}; // Track daily consumed food
        this.totalConsumedFood = {}; // Track total consumed food
        this.missionId = {};
    }

    async storeFood(food) {
        await this.magicalAIFridge.addFood(food);
    }
    
    async discardExpiredFood(currentDate) {
        const expiredFood = await this.magicalAIFridge.discardExpiredFood(currentDate);
        await this.updateExpiredFoodRecords(expiredFood, this.id);
    }

    async updateExpiredFoodRecords(expiredFood, householdId) {
        for (const food of expiredFood) {
            // Update discardedFood in Redis (hash)
            const discardedFoodKey = `household:${householdId}:discardedFood`;
            await redisClient.hIncrBy(discardedFoodKey, food.name, 1);

            // Update sharedFood in Redis (set)  remove it as we discarded
            const sharedFoodKey = `household:${householdId}:sharedFood`;
            await redisClient.sRem(sharedFoodKey, food.id);
        }
    }

    async getAllFoodItems(){
        const foodIds = await this.magicalAIFridge.getAllFood(); // Get all food IDs in the fridge
        const foodItems = [];
    
        // Fetch food details for each ID from Redis
        for (const foodId of foodIds) {
            const foodData = await this.getFoodbyhouseholdId(this.id, foodId)
            if (foodData) {
                const foodObj = JSON.parse(foodData);
                foodItems.push(foodObj);
            }
        }

        return foodItems;
    }

    async getFoodbyhouseholdId(housedolId, foodId){
        const foodData = await redisClient.get(`food:${housedolId}:${foodId}`);
        return foodData;
    }

    async impulsiveGroceryShopping() {
        // probably they may get the food in a recipe in their mind, but also, random buying stuff thats not in the recipe
        // just because they want
        const numItems = Math.floor(this.wealthLevel / 80) + 1; // Wealthier households get more items
        const groceryShopping = this.getRandomFoodItems(numItems);
        const quantity = Math.floor(this.wealthLevel / 80) + 1; // Wealthier households buy in larger quantities as they think they want to

        // so they get different set of food with same amount ???? 
        await this.buyFreshFood(groceryShopping, quantity, true); //freshly bought will not be shared easily

        if(this.toNightsRecipe){ // if they have a recipe in mind, maybe try to get it in this shopping?
            
            const missingIngredients = await this.checkForMissingIngredients(this.toNightsRecipe);

            if (missingIngredients.length > 0) {
                missingIngredients.forEach(ingredient => {
                    //a ctually it needs to know if there are anything floating in the surplus food pool?
                    //logger.info(`Household ${this.id} decides to buy fresh ${ingredient.name}`);
                    const foodtobuy = foodTypes.find(food => food.id === ingredient.ingredientId);
                    this.buyFreshFood([foodtobuy], ingredient.qty+1, true); // somehow super markets love to force you to buy more
                });
            }
        }

    }

    getRandomFoodItems(numItems) {
        const items = [];
        const usedIds = new Set();

        while (items.length < numItems) {
            const randomIndex = Math.floor(Math.random() * foodTypes.length);
            const foodItem = foodTypes[randomIndex];
            if (!usedIds.has(foodItem.id)) {
                items.push(foodItem);
                usedIds.add(foodItem.id);
            }
        }

        return items;
    }
    
    async buyFreshFood(foodItems, quantity, lock = false) {

        await foodItems.forEach(async item => {
            for (let i = 0; i < quantity; i++) {
                //quite silly , someone should check space before buying - is this ture?
                const allfoodset = await this.magicalAIFridge.getAllFood();
                if(allfoodset.length < this.magicalAIFridge.capacity){
                    // when 10 sec is one day, set to 2 days expiry
                    //const food = new Food(item.name, item.type, "Fresh", Date.now() + 2*24*10 * 1000, undefined, lock); 

                    // speed up the expiry to 3 day expires 
                    const food = new Food(item.name, item.type, "Fresh", Date.now() + 3*60*60*24 *1000 / config.timeMultiplier, 1, lock, this.id); 
                    await food.saveToRedis(); // Save food object in Redis
                    await this.storeFood(food); // register the food  in the fridge
                }
            }
        });
    }

    async decideWhatToDoWithFood() {
        const currentDate = Date.now();
        const foodItems = await this.getAllFoodItems();

        foodItems.forEach(async food => {
            if(!food.lock && this.isWillingToShare(food)){ 
                await this.shareFood(food);
            } else if(await Food.isCloseToExpiry(food, currentDate)){
                logger.info(`Household ${this.id} notices ${food.name} is close to expiry`);
                await this.useOrShareFood(food);
            }
        });

        //get all shared food and publish mission request
        const sharedFoodKey = `household:${this.id}:sharedFood`;
        const sharedFoodIds = await redisClient.sMembers(sharedFoodKey);
        // Compile the order
        const order = {};
        for (const foodId of sharedFoodIds) {
            const foodData = await this.getFoodbyhouseholdId(this.id, foodId);
            if (foodData) {
                const foodObj = JSON.parse(foodData);
                order[foodId] = foodObj.name; // Id as key or it'll overwirte itself
            }
        }
        

        await this.publishMissionRequest('food', this.id, order, 'give');

        await this.discardExpiredFood(currentDate);
    }

    isWillingToShare(food) {
        // Implement logic to decide if the household is willing to share the food
        return Math.random() > 0.3; // Example logic
    }

    async shareFood(food) {
        // Implement logic to share the food
        const sharedFoodKey = `household:${this.id}:sharedFood`;
        const foodExistsInSharePool = await redisClient.sIsMember(sharedFoodKey, food.id);
        
        //const foodExists = this.sharedFood.some(sharedFoodItem => sharedFoodItem.id === food.id);

        if (!foodExistsInSharePool) {
            logger.info(`Household ${this.id} shared ${food.name}`);
            //this.sharedFood.push(food); // Add to shared food list
            
            await redisClient.sAdd(sharedFoodKey, food.id);
        }else{
            //logger.info(`Household ${this.id} already shared ${food.name}`);
        }
        const foodKey = `food:${this.id}:${food.id}`;
        const foodData = await this.getFoodbyhouseholdId(this.id, food.id);
        if (foodData) {
            const foodObj = JSON.parse(foodData);
            foodObj.lock = false; //make sure it's unlocked before sharing
            // Save the updated food object back to Redis
            await redisClient.set(foodKey, JSON.stringify(foodObj));
        } else {
            logger.info(`Food item with ID ${food.id} not found in the storage`);
        }
        //eventEmitter.emit('foodShared', { householdId: this.id, food });

    }

    async useOrShareFood(food) {
        // a food is locked for some reason (maybe bought when fresh but it stayed in the fridge for a while, or tonight recipe has been changed)
        // but it's close to expiry so force to make a decision
        // Implement logic to use or share the food that is close to expiry
        if(!this.foodIsinRecipe(food)){
                // household will not share until consume in recipe
            if (Math.random() > 0.80) { // small chance to eat the food, RAWWWW, or microwave it, whatever
                logger.info(`Household ${this.id} uses ${food.name}`);
                await this.removeFood(food);
                //this.magicalAIFridge.removeFood(food); // Remove the food from the fridge
            } else {
                // flip to share it
                
                await this.shareFood(food);
            }
        }
    }

    foodIsinRecipe(food) {
        if (!this.toNightsRecipe) {
            return false;
        }
        return this.toNightsRecipe.ingredients.some(ingredient => ingredient.food === food.name);
    }

    async checkForMissingIngredients(recipe) {

        const foodIds = await this.magicalAIFridge.getAllFood(); // Get all food IDs in the fridge
        const foodItems = [];
        // Fetch food details for each ID from Redis
        for (const foodId of foodIds) {
            const foodData = await this.getFoodbyhouseholdId(this.id, foodId);
            if (foodData) {
                const foodObj = JSON.parse(foodData);
                foodItems.push(foodObj);
            }
        }

        const missingIngredients = recipe.ingredients.filter(ingredient => 
            !foodItems.some(food => food.name === ingredient.name && food.qty >= ingredient.qty)
        );

        return missingIngredients;

    }

    async decideWhatToDoWithRecipe(recipe) {
        const missingIngredients = await this.checkForMissingIngredients(recipe);

        if (missingIngredients.length === 0) {
            logger.info(`Household ${this.id} has all ingredients for ${recipe.name}`);
            // Retrieve all food IDs from Redis
            const foodIds = await this.magicalAIFridge.getAllFood();
            const foodItems = [];

            // Fetch food details for each ID from Redis
            for (const foodId of foodIds) {
                const foodData = await this.getFoodbyhouseholdId(this.id, foodId);
                if (foodData) {
                    const foodObj = JSON.parse(foodData);
                    foodItems.push(foodObj);
                }
            }

            // Lock the required food items and quantities so wont share it by accident
            recipe.ingredients.forEach(ingredient => {
                let requiredQty = ingredient.qty;
                foodItems.forEach(food => {
                    if (food.name === ingredient.name && requiredQty > 0 && !food.lock) {
                        const lockQty = Math.min(food.qty, requiredQty);
                        food.lock = true;
                        requiredQty -= lockQty;

                        // Save the updated food item back to Redis
                        const key = `food:${this.id}:${food.id}`;
                        redisClient.set(key, JSON.stringify(food));
                    }
                });
            });
            return;
        }

        for (const ingredient of missingIngredients) {
            // Actually it needs to know if there are anything floating in the surplus food pool?
            // in the real world you wont know - you just say I want this
            if (this.isWillingToAcceptShareFood(this.wealthLevel)) {
                logger.info(`Household ${this.id} is willing to accept ${ingredient.name} from the pool`);
                this.awaitFoodDelivery(ingredient);
            } else {
                //logger.info(`Household ${this.id} decides to buy fresh ${ingredient.name}`);
                const foodtobuy = foodTypes.find(food => food.id === ingredient.ingredientId);
                await this.buyFreshFood([foodtobuy], ingredient.qty, true);
            }
        }

        //submit mission request of getting food
        const order = await redisClient.hGetAll(`household:${this.id}:acceptFood`);
        this.publishMissionRequest('food', this.id, order, 'take');

    }

    isWillingToAcceptShareFood(wealthLevel) {
        // Wealthier households have a lower chance of accepting shared food
        const acceptanceProbability = 1 - (wealthLevel / 100);
        return Math.random() < acceptanceProbability;
    }

    isWillingToAcceptRecipe(wealthLevel){
        //default 5050
        return Math.random() > 0.5; // Example logic
    }

    async awaitFoodDelivery(food) {
        // Implement logic to send a signal to the main controller
        logger.info(`Household ${this.id} is awaiting delivery of ${food.name}`);

        const acceptFoodKey = `household:${this.id}:acceptFood`;

        // Add the food item to the accept food list in Redis with the current timestamp
        const currentTime = Date.now();
        //household may wait for some and buy some just becus einsufficient in fridge
        await redisClient.hSet(acceptFoodKey, food.name, JSON.stringify({qty: food.qty, timestamp: currentTime }));

        // we need to remove the mission from the queue 
        //await redisClient.expire(acceptFoodKey, (4 * 60 * 60 / config.timeMultiplier ) + 50);   // Expire in 4 hours, plus 50ms for the whole order
        
        // this is for transactional purpose, if the food is not delivered, the household will keep waiting 
        this.waitingForDelivery.set(food.name, food.qty);
    }

    async removeFoodFromWAitingList(food) {
        this.waitingForDelivery.delete(food.name);
    }
    async getFoodQuantityFromWaitingList(food) {
        return this.waitingForDelivery.get(food.name);
    }


    notifyFoodDeliveryOrder(confirmation){
        //false for now, no body is handling the logictics XD
        confirmation = false;
        return confirmation;
    }


    suggestRecipe(recipe) {
        if(!this.toNightsRecipe){ //actually there should be a change that the household may change their mind
            if (this.isWillingToAcceptRecipe(this.wealthLevel)) {
                logger.info(`Household ${this.id} is willing to accept the suggested recipe: ${recipe.name}`);
                this.toNightsRecipe = recipe;
                this.decideWhatToDoWithRecipe(recipe);
            } else {
                logger.info(`Household ${this.id} is not willing to accept the suggested recipe: ${recipe.name}`);
            }
        }else{
            this.decideWhatToDoWithRecipe(this.toNightsRecipe);
            logger.info(`Household ${this.id} is holding recipe: ${this.toNightsRecipe}`);
        }
    }

    async consumeFoodForRecipe() {
        if (!this.toNightsRecipe) {
            //too late now you can't get any food lol
            logger.info(`Household ${this.id} has no recipe for tonight, they decided to dine out or order food delivery`);
            return;
        }

        const recipe = new Recipe(this.toNightsRecipe.id, this.toNightsRecipe.name, this.toNightsRecipe.ingredients, this.toNightsRecipe.descripion);

        //const foodIds = await this.magicalAIFridge.getAllFood();
        const foodItems = await this.getAllFoodItems();

        if (!recipe.canBeMade(foodItems)) {
            logger.info(`Household ${this.id} does not have all ingredients for ${recipe.name}`);
            return;
        }

        recipe.ingredients.forEach(ingredient => {
            let qtyToRemove = ingredient.qty;
            while (qtyToRemove > 0) {
                const foodItem = foodItems.find(food => food.name === ingredient.name);
                if (foodItem) {
                    this.dailyConsumedFood[foodItem.name] = (this.dailyConsumedFood[foodItem.name] || 0) + 1;
                    this.totalConsumedFood[foodItem.name] = (this.totalConsumedFood[foodItem.name] || 0) + 1;
                    this.removeFood(foodItem);
                    //this.magicalAIFridge.removeFood(foodItem);
                } // there could be a chance that not enough quantity in fridge? well sometimes we still make the dish when lacking a one or two ingredients
                qtyToRemove--;  
            }

        });
        this.toNightsRecipe = undefined;
        this.dailyConsumedRecipes++;
        this.totalConsumedRecipes++;
        logger.info(`Household ${this.id} has consumed ingredients for ${recipe.name}.`);
    }

    async removeFood(food){
        //deregister it from the fridge
        await this.magicalAIFridge.removeFood(food);
        //this.sharedFood = this.sharedFood.filter(sharedFood => sharedFood !== food);
        const sharedFoodKey = `household:${this.id}:sharedFood`;
        //remove from db
        await redisClient.sRem(sharedFoodKey, food.id);
    }

    async publishMissionRequest(type, householdId, orderDetails, giveOrTake) {
        // Check if orderDetails is empty
        if (Object.keys(orderDetails).length === 0) {
            //logger.info('Order details are empty. Mission will not be published.');
            return;
        }

        // Check if a mission is already being processed
        const missionStatusKey = `household:${householdId}:missionStatus:${giveOrTake}`;
        const missionStatus = await redisClient.get(missionStatusKey);
        if (missionStatus === 'processing') {
            logger.info(`household:${householdId} A mission is already being processed`);
            return;
        }

        // Set the mission status to processing
        // this should get into mission controller to tell if a household's mission is being processed
        //await redisClient.set(missionStatusKey, 'processing');

        orderDetails = JSON.stringify(orderDetails);
        const mission = {
            type,
            householdId,
            orderDetails, // the detail for exchange process
            giveOrTake,
            timestamp: Date.now()
        };
        // Convert the mission object to an array of strings
        // Convert the mission object to an array of strings
        const missionArray = [];
        for (const [key, value] of Object.entries(mission)) {
            missionArray.push(key, value.toString());
        }
        // Check if missionId already exists and remove the existing mission
        if (this.missionId && this.missionId[giveOrTake]) {
            await redisClient.xDel('missionQueue', this.missionId[giveOrTake]);
        }

        this.missionId[giveOrTake] = await redisClient.xAdd('missionQueue', '*', missionArray);

    }

    async removeMissionRequest(entryId) {
        await redisClient.xDel('missionQueue', entryId);
    }

    async completeMission(householdId, giveOrTake) {
        const missionStatusKey = `household:${householdId}:missionStatus:${giveOrTake}`;
        await redisClient.del(missionStatusKey); // Clear the mission status
    }

}

module.exports = Household;