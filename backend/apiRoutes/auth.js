const express = require('express');
const jwt = require('jsonwebtoken');
const { findUserByUsername, validatePassword } = require('../models/user');
const router = express.Router();

const JWT_SECRET = 'jwt_secret'; // Replace with your actual secret

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = findUserByUsername(username);
    if (!user || !(await validatePassword(user, password))) {
        return res.status(401).json({ message: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login successful', token });
});

module.exports = router;