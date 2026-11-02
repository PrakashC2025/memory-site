export default function handler(_req, res) {
  const googleClientId = (
    process.env.VITE_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    ''
  ).trim();

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({ googleClientId });
}
