const { Resend } = require('resend');

const sendMail = async (to, subject, text) => {
    try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        // Use the verified domain email from environment variables, or fallback to onboarding for testing
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        
        const { data, error } = await resend.emails.send({
            from: `Smart Refrigerator <${fromEmail}>`,
            to: to,
            subject: subject,
            text: text
        });

        if (error) {
            console.error('Error sending email via Resend API:', error.message);
            return false;
        }

        console.log('Email successfully sent via Resend API! ID: ' + data.id);
        return true;
    } catch (err) {
        console.error('Crash in Resend API:', err.message);
        return false;
    }
};

module.exports = {
    sendMail
};
