export default function handler(req, res) {
  const APP_ID = process.env.DERIV_APP_ID;
  const redirect_uri = encodeURIComponent(`${process.env.BASE_URL}/api/callback`);
  const oauth_url = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&redirect_uri=${redirect_uri}&response_type=code`;
  return res.redirect(oauth_url);
}
