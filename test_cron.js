require('dotenv').config();
const { runExpiryCheck } = require('./utils/cron');

console.log("-----------------------------------------");
console.log("Starting manual test for the Expiry Cron Job...");
console.log("-----------------------------------------");

(async () => {
    try {
        const result = await runExpiryCheck();
        console.log("-----------------------------------------");
        console.log("Test execution completed successfully!");
        console.log("Result:", result);
    } catch (error) {
        console.error("Test execution failed.");
        console.error(error);
    } finally {
        process.exit(0);
    }
})();
