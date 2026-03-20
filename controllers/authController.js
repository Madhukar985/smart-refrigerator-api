const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// @route   POST api/auth/register
exports.register = async (req, res) => {
    const { name, email, password } = req.body;

    try {
        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ msg: 'Please enter all fields' });
        }

        // Check password requirements: min 8 chars, 1 uppercase, 1 special symbol
        const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ 
                msg: 'Password must be at least 8 characters, contain at least one uppercase letter and one special symbol' 
            });
        }

        // Check if user exists
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length > 0) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new user
        const [result] = await db.query(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );

        res.status(201).json({ msg: 'Registration Successful' });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'DB Error: ' + err.message });
    }
};

// @route   POST api/auth/login
exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ msg: 'Please enter all fields' });
        }

        // Check if user exists
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const user = users[0];

        // Validate password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        // Return jsonwebtoken
        const payload = {
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '24h' },
            (err, token) => {
                if (err) throw err;
                res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
            }
        );

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'DB Error: ' + err.message });
    }
};

// @route   GET api/auth/me
exports.getUser = async (req, res) => {
    try {
        const [users] = await db.query('SELECT id, name, email, created_at FROM users WHERE id = ?', [req.user.id]);
        
        if (users.length === 0) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.json(users[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   PUT api/auth/profile
exports.updateProfile = async (req, res) => {
    const { name, email, password } = req.body;
    let queryArgs = [];
    let updateFields = [];

    try {
        if (name) {
            updateFields.push('name = ?');
            queryArgs.push(name);
        }
        if (email) {
            // Check if email already taken by someone else
            const [existing] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id]);
            if (existing.length > 0) {
                return res.status(400).json({ msg: 'Email is already taken' });
            }
            updateFields.push('email = ?');
            queryArgs.push(email);
        }
        if (password) {
            const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
            if (!passwordRegex.test(password)) {
                return res.status(400).json({ 
                    msg: 'Password must be at least 8 characters, contain at least one uppercase letter and one special symbol' 
                });
            }
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            updateFields.push('password = ?');
            queryArgs.push(hashedPassword);
        }

        if (updateFields.length === 0) {
             return res.status(400).json({ msg: 'No fields provided for update' });
        }

        queryArgs.push(req.user.id);
        const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
        
        await db.query(query, queryArgs);

        res.json({ msg: 'Profile updated successfully' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
