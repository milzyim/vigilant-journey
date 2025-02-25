const bcrypt = require('bcryptjs');

const users = [
    {
        id: 1,
        username: 'admin',
        password: '$2b$10$ptIqUc6X9R8a/n7cFpoj7uv7v3DrIYp3R6heplcV9u04kAV0xgN8K' // hashed password for 'password'
    }
];

const findUserByUsername = (username) => {
    return users.find(user => user.username === username);
};

const validatePassword = async (user, password) => {
    return await bcrypt.compare(password, user.password);
};

module.exports = {
    findUserByUsername,
    validatePassword
};