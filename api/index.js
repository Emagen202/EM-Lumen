// Vercel Function entry point: every dynamic route (/api, /auth, /login, /healthz, /media) is rewritten here by vercel.json.
// Static files (/admin, /player, /shared) are served by the Vercel CDN from /public.
import { handler } from '../server/app.js';

export default handler;
