# What to Eat Tonight - Food Waste World Simulation

## Overview

This is a hobby project built in 2 weeks leisure time that simulates a food waste world where households share surplus food, and robo-taxis are used to transport food between households. 
The simulation includes features like mission management, surplus food pooling, and recipe suggestions based on surplus food.

## Features

- Distributed system using Redis for managing mission queues and shared food pools.
- Asynchronous processing of missions and tasks.
- Complex logic for handling missions, surplus food, and recipe suggestions.
- JWT-based authentication for securing API endpoints.
- Detailed logging using Winston and Morgan.
- Unit and integration tests using Mocha, Chai, and Supertest.

## Setup

### Prerequisites

- Node.js
- Docker (for Redis)
- OpenRouteService API Key (if you wish to generate other city's routes)

### Installation

1.  Clone the repository:

    ```sh
    git clone https://github.com/milzyim/fantastic-octo-chainsaw.git
    cd what-to-eat-tonight
    ```

2.  Install dependencies:

    ```sh
    npm install
    ```

3.  Set up environment variables:

    Create a `.env` file in the root directory and add the following:

    ```env
    ORS_API_KEY=your_openrouteservice_api_key
    JWT_SECRET=your_jwt_secret
    ```

    ORS_API_KEY is now bespoke in app.js - feel free to modify that to read from your .env

    and backend/config.js controls a time multiplier for the speed of simulation

4.  Start Redis using Docker:

    ```sh
    docker run --name redis -p 6800:6379 -d redis
    ```

5.  Start the backend server:

        ```sh
        cd backend
        ndoe app.js
        ```

    it'll start on http://localhost:2150 by default

    or if you're using VScode - launch.json should have the run & debug button you need

6.  Start the frontend development server:

        ```sh
        cd frontend
        npm start
        ```

    it'll start on http://localhost:3000 by default

## Usage

### Authentication

no UI implementation yet and everything is default with credentials:

- Username: `admin`
- Password: `password`

### API Endpoints
All API endpoints require the [Authorization](http://_vscodecontentref_/1) header with the Bearer token.

Endpoints detail TBC

## Testing

Run unit and integration tests:

        ```sh
        npm test
        ```

### Logging

Logs are managed using Winston and Morgan. Logs are written to the console and to log files (combined.log and error.log).

### License

This project is licensed under the MIT License.
