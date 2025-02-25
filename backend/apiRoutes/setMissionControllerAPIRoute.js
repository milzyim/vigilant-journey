function setMissionControllerAPIRoute(app, missionController) {
    app.post('/toggle-advanced-mission-management', missionController.toggleAdvancedMissionManagement.bind(missionController));
}

module.exports = setMissionControllerAPIRoute;