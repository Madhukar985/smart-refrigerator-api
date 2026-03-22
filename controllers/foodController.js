const db = require('../config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
            Analyze this image of a grocery or food item.
            You must return a raw JSON object string. Do not wrap it in markdown code blocks. Do not include any conversational text like "Here is the JSON" or "I am sorry".
            The JSON object must exact exactly these keys:
            {
                "name": "String (the specific name of the food item, e.g., 'Eggs', 'Milk')",
                "category": "String (must be one of: 'Dairy', 'Vegetables', 'Fruits', 'Meat', 'Bakery', 'Beverages', 'Others')",
                "quantity": Number (estimated fractional or whole quantity, e.g., 12.0 for eggs, 1.5 for a bag),
                "unit": "String (must be one exactly of: 'pcs', 'kg', 'gm', 'L', 'ml')",
                "expiryDays": Number (CRITICAL INSTRUCTION: FIRST, strictly search the image for ANY printed expiration dates, "Best By", "Sell By", or "Use By" labels. If you can read a exact date printed anywhere on the packaging, calculate the exact number of days from today until that printed date. ONLY if there is absolutely no printed date visible, then estimate the days until it expires based on standard food safety knowledge)
            }
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: image, mimeType: "image/jpeg" } }
        ]);

        const text = result.response.text();
        
        // Clean the text aggressively before parsing
        let jsonStr = text.trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.substring(7);
        if (jsonStr.startsWith('```')) jsonStr = jsonStr.substring(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        jsonStr = jsonStr.trim();

        try {
            const parsedData = JSON.parse(jsonStr);
            res.json(parsedData);
        } catch (parseError) {
            console.error("Gemini AI API Error: Invalid JSON:", jsonStr);
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
            SELECT item_name, quantity, unit, DATEDIFF(expiry_date, CURDATE()) as days_to_expire
            FROM food_items
            WHERE user_id = ? AND DATEDIFF(expiry_date, CURDATE()) IN (1, 2) AND status = 'Fresh'
        `;
        
        const [expiringItems] = await db.query(query, [req.user.id]);
        
        let aiSuggestion = null;

        if (expiringItems.length > 0 && process.env.GEMINI_API_KEY) {
            let itemsListText = expiringItems.map(i => i.item_name).join(', ');
            
            try {
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                const prompt = `I have the following food items expiring in my fridge: ${itemsListText}. Suggest 2 or 3 creative Indian meals or recipes I can cook using some or all of these items. Provide the name of each Indian dish and a 1-2 sentence short description. Keep it brief. Return it formatted nicely as a list.`;
                const result = await model.generateContent(prompt);
                aiSuggestion = result.response.text().trim();
            } catch (aiError) {
                if (aiError.message && aiError.message.includes('429')) {
                    console.error("Gemini AI Quota Exceeded for Meal Suggestions");
                    aiSuggestion = "AI Meal suggestions are temporarily unavailable due to high demand (API Quota Exceeded). Please try again later.";
                } else {
                    console.error('AI Suggestion Error on Dashboard:', aiError.message);
                    aiSuggestion = "Could not generate AI meal suggestion at this time.";
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
