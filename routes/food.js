const express = require('express');
const router = express.Router();
const foodController = require('../controllers/foodController');
const auth = require('../utils/authMiddleware');
const multer = require('multer');

// Configure multer for memory storage (for camera uploads if needed as multipart form data)
const upload = multer({ storage: multer.memoryStorage() });

// @route   POST api/food
// @desc    Add a new food item (manual or via camera)
// @access  Private
router.post('/', auth, upload.single('image'), foodController.addFoodItem);

// @route   POST api/food/analyze-image
// @desc    Analyze an image using AI to extract food data
// @access  Private
router.post('/analyze-image', auth, foodController.analyzeImage);

// @route   GET api/food
// @desc    Get all food items for logged-in user
// @access  Private
router.get('/', auth, foodController.getFoodItems);

// @route   PUT api/food/:id
// @desc    Update food item
// @access  Private
router.put('/:id', auth, foodController.updateFoodItem);

// @route   DELETE api/food/:id
// @desc    Delete food item
// @access  Private
router.delete('/:id', auth, foodController.deleteFoodItem);

// @route   GET api/food/stats
// @desc    Get food statistics for charts
// @access  Private
router.get('/stats', auth, foodController.getFoodStats);

// @route   GET api/food/expiring
// @desc    Get expiring food items and AI recipe suggestion
// @access  Private
router.get('/expiring', auth, foodController.getExpiringItemsWithAI);

module.exports = router;
