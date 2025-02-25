const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Load food types
const foodTypes = require('../cache/foodTypes.json');

// Function to get a random integer between min and max (inclusive)
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Function to generate a random recipe name
function generateRecipeName(ingredients) {
    const mainIngredient = ingredients[0].name;
    const cuisineTypes = ['Delight', 'Surprise', 'Feast', 'Special', 'Treat', 'Extravaganza', 'Medley', 'Fusion', 'Blend', 'Mix'];
    const cuisine = cuisineTypes[getRandomInt(0, cuisineTypes.length - 1)];
    return `${mainIngredient} ${cuisine}`;
}

// Function to generate a random recipe description
function generateRecipeDescription(ingredients) {
    const steps = ['boil', 'chop', 'season', 'fry', 'mix well', 'bake', 'grill', 'steam', 'roast'];
    const description = ingredients.map(ingredient => {
        const step = steps[getRandomInt(0, steps.length - 1)];
        return `${step} ${ingredient.name}`;
    });
    description.push('serve and enjoy!');
    return description.join('. ');
}

// Function to generate random recipes
function generateRecipes(numRecipes) {
    const recipes = [];
    for (let i = 1; i <= numRecipes; i++) {
        const numIngredients = getRandomInt(3, 6); // Each recipe will have between 3 and 6 ingredients
        const ingredients = [];
        const usedIds = new Set();

        while (ingredients.length < numIngredients) {
            const randomIndex = getRandomInt(0, foodTypes.length - 1);
            const ingredient = foodTypes[randomIndex];
            if (!usedIds.has(ingredient.id)) {
                ingredients.push({
                    ingredientId: ingredient.id,
                    name: ingredient.name,
                    qty: getRandomInt(1, 5) // Random quantity between 1 and 5
                });
                usedIds.add(ingredient.id);
            }
        }

        const recipeName = generateRecipeName(ingredients);

        // THIS IS WHY WE HAVE FOOD WASTE LOLLLLLLLLLLLLLL 2/5/2025 
        const recipeDescription = generateRecipeDescription(ingredients);
        
        recipes.push({
            id: i,
            name: recipeName,
            ingredients: ingredients,
            description: recipeDescription
        });
    }
    return recipes;
}

// Generate 100 recipes
const recipes = generateRecipes(100);

// Save recipes to a JSON file
const outputPath = path.join(path.resolve(), '../cache/recipes.json');
fs.writeFileSync(outputPath, JSON.stringify(recipes, null, 2));

logger.info(`Generated ${recipes.length} recipes and saved to ${outputPath}`);