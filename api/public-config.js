export default function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawClientId = (
    process.env.VITE_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    ''
  ).trim();

  // Only expose a valid Google OAuth Web Client ID, never arbitrary env values.
  const googleClientId = /^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/i.test(rawClientId)
    ? rawClientId
    : '';

  res.status(200).json({ googleClientId });
}
