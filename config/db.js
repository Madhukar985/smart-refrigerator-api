const mysql = require('mysql2/promise');

// Create connection to database
const createDBConnection = async () => {
    try {
        // First connect without database selected to create it if it doesn't exist
        try {
            const connection = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
            });

            await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
            await connection.end();
        } catch (dbErr) {
            console.warn("Notice: Skipping database creation command (blocked by Aiven). Assuming database exists.");
        }

        // Connect with database selected
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        console.log('MySQL connected successfully.');

        // Initialize Tables
        await initTables(pool);

        return pool;
    } catch (err) {
        console.error('MySQL Connection Error:', err.message);
        process.exit(1);
    }
};

const initTables = async (pool) => {
    try {
        const usersTable = `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const foodItemsTable = `
            CREATE TABLE IF NOT EXISTS food_items (
                item_id INT AUTO_INCREMENT PRIMARY KEY,
                item_name VARCHAR(100) NOT NULL,
                category VARCHAR(50) NOT NULL,
                quantity INT NOT NULL,
                expiry_date DATE NOT NULL,
                status VARCHAR(50) DEFAULT 'Fresh',
                user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `;

        await pool.query(usersTable);
        await pool.query(foodItemsTable);
        console.log('Database tables initialized.');

    } catch (err) {
        console.error('Error initializing tables:', err.message);
    }
};

// Start connection
const poolPromise = createDBConnection();

module.exports = {
    poolPromise,
    query: async (sql, params) => {
        const pool = await poolPromise;
        return pool.query(sql, params);
    }
};
