const cron = require('node-cron');
const db = require('../config/db');
const { sendMail } = require('../config/mail');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const runExpiryCheck = async (userId = null) => {
    console.log('Running Expiry Alert Job...');

    try {
        // Find items expiring today or in the future
        let query = `
            SELECT f.item_name, f.expiry_date, f.quantity, f.unit, u.name as owner_name,
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
            // If triggered manually by a specific user, only send to them. Otherwise, send to all (cron job).
            let usersQuery = 'SELECT name, email FROM users';
            let usersParams = [];
            
            if (userId) {
                usersQuery += ' WHERE id = ?';
                usersParams.push(userId);
            }

            const [targetUsers] = await db.query(usersQuery, usersParams);

            if (targetUsers.length === 0) {
                console.log('No registered users found to send alerts.');
                return { success: false, message: 'No registered users found.' };
            }

            let itemsListText = "";
            let itemsDetails = "";

            expiringItems.forEach(item => {
                let daysText = '';
                if (item.days_to_expire === 0) {
                    daysText = 'today';
                } else if (item.days_to_expire === 1) {
                    daysText = 'in 1 day';
                } else {
                    daysText = `in ${item.days_to_expire} days`;
                }
                const ownerInfo = item.owner_name ? ` (Added by: ${item.owner_name})` : '';
                itemsDetails += `- ${item.item_name} (Quantity: ${item.quantity} ${item.unit || 'pcs'})${ownerInfo} is going to expire ${daysText}.\n`;
                itemsListText += `${item.item_name}, `;
            });

            // Generate AI Meal Suggestion
            let aiSuggestion = "Consider using these items soon to prevent food waste.";
            if (process.env.GEMINI_API_KEY && itemsListText) {
                try {
                    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                    const prompt = `I have the following food items expiring in my fridge: ${itemsListText}. Suggest 2 or 3 creative Indian meals or recipes I can cook using some or all of these items. Provide the name of each Indian dish and a 1-2 sentence short description. Keep it brief. Return it formatted nicely as a list.`;
                    const result = await model.generateContent(prompt);
                    aiSuggestion = '💡 AI Recipe Suggestion: \n' + result.response.text().trim();
                } catch (aiError) {
                    console.error('AI Suggestion Error:', aiError.message);
                }
            }

            // Send emails to the target users
            let sentCount = 0;
            for (const user of targetUsers) {
                let message = `Hello ${user.name},\n\nThis is a friendly reminder that the following items in the Smart Refrigerator are expiring soon:\n\n`;
                message += itemsDetails;
                message += `\n${aiSuggestion}\n`;
                message += `\nBest regards,\nSmart Refrigerator Management System`;

                const success = await sendMail(user.email, 'Food Expiry Alert', message);
                if (success) {
                    sentCount++;
                    console.log(`Alert sent to ${user.email} for ${expiringItems.length} items.`);
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

// Run every day at 10:45 PM (45 22 * * *)
cron.schedule('45 22 * * *', () => runExpiryCheck(), {
    timezone: "Asia/Kolkata"
});

console.log('Expiry Alert Scheduler initialized.');

module.exports = { runExpiryCheck };
