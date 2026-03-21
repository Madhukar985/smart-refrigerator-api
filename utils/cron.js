const cron = require('node-cron');
const db = require('../config/db');
const { sendMail } = require('../config/mail');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const runExpiryCheck = async (userId = null) => {
    console.log('Running Expiry Alert Job...');

    try {
        // Find items expiring today or in the future and also get the user's email
        let query = `
            SELECT f.item_name, f.expiry_date, f.quantity, u.email, u.name,
                   DATEDIFF(f.expiry_date, CURDATE()) as days_to_expire
            FROM food_items f
            JOIN users u ON f.user_id = u.id
            WHERE DATEDIFF(f.expiry_date, CURDATE()) >= 0 
              AND DATEDIFF(f.expiry_date, CURDATE()) <= 3 
              AND f.status = 'Fresh'
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
                        name: item.name,
                        items: []
                    };
                }
                itemsByUser[item.email].items.push(item);
            });

            // Send emails
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
                    message += `- ${item.item_name} (Quantity: ${item.quantity}) is going to expire ${daysText}.\n`;
                    itemsListText += `${item.item_name}, `;
                });

                // Generate AI Meal Suggestion
                let aiSuggestion = "Consider using these items soon to prevent food waste.";
                if (process.env.GEMINI_API_KEY && itemsListText) {
                    try {
                        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                        const prompt = `I have the following food items expiring in my fridge: ${itemsListText}. Suggest a creative meal I can cook using some or all of these items. Provide the name of the meal and a 1-2 sentence short description. Keep it brief.`;
                        const result = await model.generateContent(prompt);
                        aiSuggestion = '💡 AI Recipe Suggestion: \n' + result.response.text().trim();
                    } catch (aiError) {
                        console.error('AI Suggestion Error:', aiError.message);
                    }
                }

                message += `\n${aiSuggestion}\n`;

                message += `\nBest regards,\nSmart Refrigerator Management System`;

                await sendMail(email, 'Food Expiry Alert', message);
                console.log(`Alert sent to ${email} for ${user.items.length} items.`);
            }
            return { success: true, message: `Sent alerts to ${Object.keys(itemsByUser).length} users.` };
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
cron.schedule('0 9 * * *', () => runExpiryCheck(), {
    timezone: "Asia/Kolkata"
});

console.log('Expiry Alert Scheduler initialized.');

module.exports = { runExpiryCheck };
