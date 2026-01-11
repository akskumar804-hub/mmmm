const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');

function nowIso() {
  return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

function addDaysIso(iso, days) {
  return dayjs(iso, 'YYYY-MM-DD HH:mm:ss').add(days, 'day').format('YYYY-MM-DD HH:mm:ss');
}

function randomEnrollmentNo(courseCode, id) {
  // Use courseCode if available, otherwise use a default
  const safe = (courseCode || 'COURSE').toString().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const seq = String(id).padStart(6, '0');
  return `ENR-${safe}-${seq}`;
}

function randomCertificateNo(courseCode) {
  const safe = (courseCode || 'COURSE').toString().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return `CERT-${safe}-${uuidv4().slice(0, 8).toUpperCase()}`;
}

module.exports = { nowIso, addDaysIso, randomEnrollmentNo, randomCertificateNo };
