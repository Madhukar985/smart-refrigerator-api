const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../utils/authMiddleware');

// @route   POST api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', authController.register);

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', authController.login);

// @route   GET api/auth/me
// @desc    Get logged in user
// @access  Private
router.get('/me', auth, authController.getUser);

// @route   PUT api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, authController.updateProfile);

// @route   POST api/auth/test-email
// @desc    Trigger the expiry email cron job manually
// @access  Private
const { runExpiryCheck } = require('../utils/cron');
router.post('/test-email', auth, async (req, res) => {
    const result = await runExpiryCheck(req.user.id);
    if (result.success) {
        res.json(result);
    } else {
        res.status(500).json(result);
    }
});

module.exports = router;
