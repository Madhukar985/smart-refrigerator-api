const cron = require('node-cron');
const db = require('../config/db');
const { sendMail } = require('../config/mail');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const runExpiryCheck = async (userId = null) => {
    console.log('Running Expiry Alert Job...');

    try {
        // Find items expiring today or in the future and also get the user's email
        let query = `
            SELECT f.item_name, f.category, f.expiry_date, f.quantity, f.unit, u.email, u.name as owner_name,
                   DATEDIFF(f.expiry_date, CURDATE()) as days_to_expire
            FROM food_items f
            JOIN users u ON f.user_id = u.id
            WHERE DATEDIFF(f.expiry_date, CURDATE()) >= 0 
              AND DATEDIFF(f.expiry_date, CURDATE()) <= 3 
              AND f.status IN ('Fresh', 'Expiring Soon')
        `;
        let queryParams = [];

        if (userId) {
            query += ` AND f.user_id = ?`;
            queryParams.push(userId);
        }

        const [expiringItems] = await db.query(query, queryParams);

        if (expiringItems.length > 0) {
            // Group items by user email to send one consolidated email per user
            const itemsByUser = {};

            expiringItems.forEach(item => {
                if (!itemsByUser[item.email]) {
                    itemsByUser[item.email] = {
                        name: item.owner_name,
                        items: []
                    };
                }
                itemsByUser[item.email].items.push(item);
            });

            // Send emails specifically to the users who own the expiring items
            let sentCount = 0;
            for (const email in itemsByUser) {
                const user = itemsByUser[email];
                let message = `Hello ${user.name},\n\nThis is a friendly reminder that the following items in your Smart Refrigerator are expiring soon:\n\n`;

                let itemsListText = "";
                user.items.forEach(item => {
                    let daysText = '';
                    if (item.days_to_expire === 0) {
                        daysText = 'today';
                    } else if (item.days_to_expire === 1) {
                        daysText = 'in 1 day';
                    } else {
                        daysText = `in ${item.days_to_expire} days`;
                    }
                    message += `- ${item.item_name} (Quantity: ${item.quantity} ${item.unit || 'pcs'}) is going to expire ${daysText}.\n`;
                    itemsListText += `${item.item_name} (Category: ${item.category || 'Unknown'}), `;
                });

                // Generate AI Meal Suggestion specifically for this user's items
                let aiSuggestion = "Consider using these items soon to prevent food waste.";
                if (process.env.GEMINI_API_KEY && itemsListText) {
                    try {
                        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                        const prompt = `I have the following food items expiring in my fridge: ${itemsListText}. Suggest 2 or 3 creative Indian meals or recipes I can cook using some or all of these items. Predict the food items according to their categories to make the meal well-balanced. Provide the name of each Indian dish and a 1-2 sentence short description. Keep it brief. Return it formatted nicely as a list.`;
                        const result = await model.generateContent(prompt);
                        aiSuggestion = '💡 AI Recipe Suggestion: \n' + result.response.text().trim();
                    } catch (aiError) {
                        if (aiError.message && aiError.message.includes('429')) {
                            console.error("Gemini AI Quota Exceeded for Email Alerts");
                            let fallback = `Here are some quick ideas for your expiring items:\n\n`;
                            fallback += `- Stir Fry / Mix Curry: Toss your fresh ingredients into a quick comforting Indian curry or sabzi.\n`;
                            fallback += `- Pulao / Fried Rice: Mix your remaining items with rice and gentle spices for an easy meal.\n\n`;
                            fallback += `(AI personalized recipes are temporarily paused to save API quota. Try again tomorrow!)`;
                            aiSuggestion = '💡 AI Recipe Suggestion: \n' + fallback;
                        } else {
                            console.error('AI Suggestion Error:', aiError.message);
                        }
                    }
                }

                message += `\n${aiSuggestion}\n`;
                message += `\nBest regards,\nSmart Refrigerator Management System`;

                const success = await sendMail(email, 'Food Expiry Alert', message);
                if (success) {
                    sentCount++;
                    console.log(`Alert sent to ${email} for ${user.items.length} items.`);
                }
            }
            return { success: true, message: `Sent alerts to ${sentCount} users.` };
        } else {
            console.log('No expiring items found today.');
            return { success: true, message: 'No expiring items found.' };
        }

    } catch (err) {
        console.error('Error in Expiry Alert Job:', err.message);
        return { success: false, error: err.message };
    }
}

// Run every day at 9:00 AM (0 9 * * *)
cron.schedule('45 22 * * *', () => runExpiryCheck(), {
    timezone: "Asia/Kolkata"
});

console.log('Expiry Alert Scheduler initialized.');

module.exports = { runExpiryCheck };
