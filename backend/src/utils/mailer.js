const nodemailer = require('nodemailer');

let cachedTransport = null;

function buildTransport() {
  if (cachedTransport) return cachedTransport;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('⚠️ SMTP not fully configured. Emails will NOT be sent.');
    return null;
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // correct
    auth: { user, pass }
  });

  // 🔥 verify once at startup
  transport.verify()
    .then(() => console.log('✅ SMTP connection verified'))
    .catch(err => {
      console.error('❌ SMTP verification failed:', err.message);
    });

  cachedTransport = transport;
  return transport;
}

async function sendEmail({ to, subject, html, text }) {
  const from =
    process.env.EMAIL_FROM ||
    process.env.SMTP_USER;

  const transport = buildTransport();

  if (!transport) {
    console.log('\n--- EMAIL SKIPPED (SMTP not configured) ---');
    console.log({ to, subject });
    return { skipped: true };
  }

  console.log('📨 Sending email to:', to);

  const info = await transport.sendMail({
    from,
    to,
    subject,
    text,
    html
  });

  console.log('✅ Email sent:', info.messageId);
  return info;
}

module.exports = { sendEmail };
