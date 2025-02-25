const logger = require('../utils/logger');

class Recipe {
    constructor(id, name, ingredients, description) {
      this.recipeId = id;
      this.name = name; // e.g., "Spaghetti Bolognese"
      this.ingredients = ingredients; // [{ food: "Tomato", qty: 2 }, { food: "Pasta", qty: 1 }]
      this.description = description;
    }
  
    canBeMade(householdFood) {
      if (!this.ingredients) {
        logger.error(`Ingredients are undefined for recipe: ${this.name}`);
        return false;
      }
      // Create a map to count occurrences of each food item in householdFood
      const foodCount = householdFood.reduce((countMap, food) => {
          countMap[food.name] = (countMap[food.name] || 0) + 1;
          return countMap;
      }, {});

      // Check if household has all required ingredients in sufficient quantity
      return this.ingredients.every(ingredient => {
          return foodCount[ingredient.name] >= ingredient.qty;
      });
    }
  }
  
  module.exports = Recipe;