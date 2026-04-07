const db = require('../config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Cache for AI meal suggestions to prevent rate-limiting
const suggestionCache = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

// @route   POST api/food
exports.addFoodItem = async (req, res) => {
    try {
        let { item_name, category, quantity, unit, expiry_date, status } = req.body;
        
        // If the request contains an image (from Camera API), we could integrate OCR or an AI service here.
        // For this implementation, we assume the frontend processes the image and sends the extracted data,
        // OR the user inputs it manually.
        
        if (!item_name || !category || !quantity || !expiry_date) {
            return res.status(400).json({ msg: 'Please provide all required fields' });
        }

        if (!status) status = 'Fresh';
        if (!unit) unit = 'pcs';

        const [result] = await db.query(
            'INSERT INTO food_items (item_name, category, quantity, unit, expiry_date, status, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [item_name, category, quantity, unit, expiry_date, status, req.user.id]
        );

        res.status(201).json({ msg: 'Item Added Successfully', item_id: result.insertId });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   GET api/food
exports.getFoodItems = async (req, res) => {
    try {
        const [items] = await db.query(
            'SELECT * FROM food_items WHERE user_id = ? ORDER BY expiry_date ASC',
            [req.user.id]
        );
        res.json(items);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   PUT api/food/:id
exports.updateFoodItem = async (req, res) => {
    const { item_name, category, quantity, unit, expiry_date, status } = req.body;
    const itemId = req.params.id;

    try {
        // Verify ownership
        const [existing] = await db.query('SELECT * FROM food_items WHERE item_id = ? AND user_id = ?', [itemId, req.user.id]);
        
        if (existing.length === 0) {
            return res.status(404).json({ msg: 'Item not found or unauthorized' });
        }

        const updateData = {
            item_name: item_name || existing[0].item_name,
            category: category || existing[0].category,
            quantity: quantity !== undefined ? quantity : existing[0].quantity,
            unit: unit || existing[0].unit || 'pcs',
            expiry_date: expiry_date || existing[0].expiry_date,
            status: status || existing[0].status
        };

        await db.query(
            'UPDATE food_items SET item_name = ?, category = ?, quantity = ?, unit = ?, expiry_date = ?, status = ? WHERE item_id = ?',
            [updateData.item_name, updateData.category, updateData.quantity, updateData.unit, updateData.expiry_date, updateData.status, itemId]
        );

        res.json({ msg: 'Item Updated Successfully' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   DELETE api/food/:id
exports.deleteFoodItem = async (req, res) => {
    const itemId = req.params.id;

    try {
        // Verify ownership
        const [existing] = await db.query('SELECT * FROM food_items WHERE item_id = ? AND user_id = ?', [itemId, req.user.id]);
        
        if (existing.length === 0) {
            return res.status(404).json({ msg: 'Item not found or unauthorized' });
        }

        await db.query('DELETE FROM food_items WHERE item_id = ?', [itemId]);

        res.json({ msg: 'Item Deleted Successfully' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   GET api/food/stats
exports.getFoodStats = async (req, res) => {
    try {
        const [categoryStats] = await db.query(
            'SELECT category, COUNT(*) as count, SUM(quantity) as total_quantity FROM food_items WHERE user_id = ? GROUP BY category',
            [req.user.id]
        );

        const [statusStats] = await db.query(
            'SELECT status, COUNT(*) as count FROM food_items WHERE user_id = ? GROUP BY status',
            [req.user.id]
        );

        res.json({ categories: categoryStats, status: statusStats });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   POST api/food/analyze-image
exports.analyzeImage = async (req, res) => {
    try {
        const { image } = req.body; // base64 image data
        
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: 'Gemini API Key is not configured in .env' });
        }
        
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Switched to flash model as flash-lite may not follow strict JSON formatting as well
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
            Analyze this image and identify the EXACT primary grocery or food item shown.
            CRITICAL INSTRUCTIONS:
            1. Detect the EXACT item. Read any text, labels, brand names, flavors, and weights visible on the packaging. Your returned name MUST be the complete, precise product name (e.g., "Britannia Good Day Cashew Cookies", "Amul Pasteurized Butter 500g", "Lays India's Magic Masala Potato Chips"). Do NOT just say "Bottle", "Packet", "Biscuits", or "Chips".
            2. For fruits, vegetables, and produce: Execute a deep visual analysis. Differentiate between visually similar items (e.g., Mosambi vs Lemon/Lime, Spinach vs Coriander, different Apple varieties) by cross-referencing subtle visual cues like skin texture, pore density, thickness, color gradients, and shape. Do NOT default to generic categories; identify the EXACT specific variety.
            3. Use FORMAL Indian English nomenclature. Avoid colloquial or slang terms (e.g., ALWAYS use "Sapota" instead of "Chikoo", use "Coriander" instead of "Cilantro" or "Dhania", use "Muskmelon" instead of "Cantaloupe").
            4. Ignore background objects, hands, or irrelevant text.
            5. You MUST return ONLY a valid JSON object matching exactly this structure.
            
            {
                "name": "String (the specific, exact name of the food item including brand/variant if visible, e.g., 'Amul Taaza Homogenised Toned Milk', 'Mosambi')",
                "category": "String (must be exactly one of: 'Dairy', 'Vegetables', 'Fruits', 'Meat', 'Bakery', 'Beverages', 'Others')",
                "quantity": Number (estimated quantity, e.g., 12 for eggs, 1 for a single packet),
                "unit": "String (must be exactly one of: 'pcs', 'kg', 'gm', 'L', 'ml')",
                "expiryDays": Number (CRITICAL: FIRST attempt to read any printed expiration date on the packaging. If you find a date, calculate days from today until that date. If no date is visible, estimate the remaining shelf life in days based on standard food safety knowledge)
            }
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: image, mimeType: "image/jpeg" } }
        ]);

        const text = result.response.text();

        try {
            const parsedData = JSON.parse(text);
            res.json(parsedData);
        } catch (parseError) {
            console.error("Gemini AI API Error: Invalid JSON:", text);
            res.status(500).json({ error: 'Failed to process AI response into valid format. Please try again.' });
        }
        
    } catch (err) {
        if (err.message && err.message.includes('429')) {
             console.error("Gemini AI Quota Exceeded:", err.message);
             return res.status(429).json({ error: 'AI Quota Exceeded. Please check your API key limits or wait a moment.' });
        }
        console.error("Gemini AI API Error:", err.message);
        res.status(500).json({ error: 'Failed to analyze image using AI' });
    }
};

// @route   GET api/food/expiring
exports.getExpiringItemsWithAI = async (req, res) => {
    try {
        const query = `
            SELECT item_name, category, quantity, unit, DATEDIFF(expiry_date, CURDATE()) as days_to_expire
            FROM food_items
            WHERE user_id = ? AND DATEDIFF(expiry_date, CURDATE()) >= 0 AND DATEDIFF(expiry_date, CURDATE()) <= 3 AND status IN ('Fresh', 'Expiring Soon')
        `;
        
        const [expiringItems] = await db.query(query, [req.user.id]);
        
        let aiSuggestion = null;

        const allowedCategories = ['Dairy', 'Vegetables', 'Meat'];
        const filteredItems = expiringItems.filter(i => allowedCategories.includes(i.category));

        if (filteredItems.length > 0 && process.env.GEMINI_API_KEY) {
            let itemsListText = filteredItems.map(i => `${i.item_name} (Category: ${i.category})`).sort().join(', ');
            
            // 1. Check Cache
            const cached = suggestionCache.get(req.user.id);
            if (cached && cached.itemsListText === itemsListText && (Date.now() - cached.timestamp < CACHE_TTL)) {
                aiSuggestion = cached.suggestion;
            } else {
                // 2. Fetch from AI if no valid cache
                try {
                    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                    const prompt = `I have the following food items expiring in my fridge: ${itemsListText}. Group your meal suggestions specifically by the categories: Dairy, Vegetables, and Meat. For each of these categories (if expiring items exist for it), suggest 1 or 2 creative Indian meals or recipes I can cook using the expiring items. Provide the name of each Indian dish and a 1-2 sentence short description. Keep it brief and return it formatted nicely as a list grouped strictly by these three categories. Do NOT include any other categories in the output.`;
                    const result = await model.generateContent(prompt);
                    aiSuggestion = result.response.text().trim();
                    
                    // Save to cache
                    suggestionCache.set(req.user.id, {
                        itemsListText,
                        suggestion: aiSuggestion,
                        timestamp: Date.now()
                    });
                } catch (aiError) {
                    if (aiError.message && aiError.message.includes('429')) {
                        console.error("Gemini AI Quota Exceeded for Meal Suggestions");
                        
                        let fallback = `Here are some quick ideas for your expiring items (${itemsListText}):<br><br>`;
                        fallback += `&bull; <strong>Stir Fry / Mix Curry</strong>: Toss your fresh ingredients into a quick comforting Indian curry or sabzi.<br>`;
                        fallback += `&bull; <strong>Pulao / Fried Rice</strong>: Mix remaining items with rice and gentle spices for an easy meal.<br><br>`;
                        fallback += `<i>(AI personalized recipes are temporarily paused to save API quota. Try again later!)</i>`;
                        aiSuggestion = fallback;
                    } else {
                        console.error('AI Suggestion Error on Dashboard:', aiError.message);
                        aiSuggestion = "Could not generate AI meal suggestion at this time.";
                    }
                }
            }
        }

        res.json({
            expiringItems,
            aiSuggestion
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
