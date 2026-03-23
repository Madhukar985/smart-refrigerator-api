const sendMail = async (to, subject, text) => {
    try {
        if (!process.env.BREVO_API_KEY) {
            console.error('Missing BREVO_API_KEY in environment variables.');
            return false;
        }

        const fromEmail = process.env.BREVO_FROM_EMAIL || 'your-verified-email@gmail.com';

        const payload = {
            sender: { email: fromEmail, name: "Smart Refrigerator" },
            to: [{ email: to }],
            subject: subject,
            textContent: text
        };

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error sending email via Brevo API:', errorData);
            return false;
        }

        const data = await response.json();
        console.log('Email successfully sent via Brevo API! Message ID: ' + data.messageId);
        return true;
    } catch (err) {
        console.error('Crash in Brevo API:', err.message);
        return false;
    }
};

module.exports = {
    sendMail
};
