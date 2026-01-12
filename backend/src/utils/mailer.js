const nodemailer = require('nodemailer');

let transporter;

function getTransport() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false, // MUST be false for 587
    auth: {
      user: process.env.SMTP_USER, // "apikey"
      pass: process.env.SMTP_PASS  // Brevo SMTP key
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000
  });

  transporter.verify()
    .then(() => console.log('✅ Brevo SMTP verified'))
    .catch(err => console.error('❌ Brevo SMTP error:', err.message));

  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  console.log('📨 Sending email to:', to);

  const info = await getTransport().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    html
  });

  console.log('✅ Email sent:', info.messageId);
  return info;
}

module.exports = { sendEmail };
