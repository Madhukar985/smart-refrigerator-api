const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    // Get token from header
    const token = req.header('Authorization');

    // Check if no token
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        // Assume format is "Bearer <token>"
        const tokenString = token.startsWith('Bearer ') ? token.slice(7) : token;
        
        // Verify token
        const decoded = jwt.verify(tokenString, process.env.JWT_SECRET);
        
        // Add user to payload
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

module.exports = verifyToken;
