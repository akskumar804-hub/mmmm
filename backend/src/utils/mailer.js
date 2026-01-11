const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY not set. Email skipped.');
    return { skipped: true };
  }

  console.log('📨 Sending email to:', to);

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'LMS <onboarding@resend.dev>',
    to,
    subject,
    html: html || `<p>${text}</p>`
  });

  if (error) {
    console.error('❌ Resend error:', error);
    throw error;
  }

  console.log('✅ Email sent via Resend:', data.id);
  return data;
}

module.exports = { sendEmail };
