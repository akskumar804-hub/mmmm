//const API_BASE = import.meta.env.VITE_API_URL || 'https://mtmmm-2.onrender.com/api';
const API_BASE ='https://mtmmm-2.onrender.com/api';
export async function apiRequest(path, { method = 'GET', token, body, isForm = false } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined
  });

  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const errMsg = data?.error || `Request failed (${res.status})`;
    const error = new Error(errMsg);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}
