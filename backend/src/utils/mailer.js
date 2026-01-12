const nodemailer = require('nodemailer');

let transporter;

function getTransport() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // MUST be false for 587
    requireTLS:true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000
  });

  transporter.verify()
    .then(() => console.log('✅ Gmail SMTP verified'))
    .catch(err => console.error('❌ Gmail SMTP error:', err.message));

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
