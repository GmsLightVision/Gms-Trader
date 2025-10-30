// api/login.js
export default function handler(req, res) {
  const APP_ID = process.env.DERIV_APP_ID;
  const REDIRECT = encodeURIComponent(`${process.env.BASE_URL}/api/callback`);
  // usa response_type=code para trocar server-side
  const oauthUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&redirect_uri=${REDIRECT}&response_type=code`;
  return res.redirect(oauthUrl);
}
