const { expressjwt: jwt } = require('express-jwt');

const JWT_SECRET = 'jwt_secret'; // Replace with your actual secret

const authenticate = jwt({
    secret: JWT_SECRET,
    algorithms: ['HS256']
});

module.exports = authenticate;