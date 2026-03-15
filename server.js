const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ debug: false, override: false });

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('public'));

// Routes
const authRoutes = require('./routes/auth');
const foodRoutes = require('./routes/food');

app.use('/api/auth', authRoutes);
app.use('/api/food', foodRoutes);

// Database connection check
require('./config/db');

// Initialize Cron Jobs
require('./utils/cron');

// Root route (API check)
app.get('/api', (req, res) => {
    res.json({ message: 'Smart Refrigerator API is running' });
});

// Fallback route for frontend (SPA-like routing or serve specific HTML files)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
