// api/callback.js
import axios from "axios";

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send("Código OAuth ausente.");

  try {
    // Troca code por token (POST-form)
    const tokenResp = await axios({
      method: "post",
      url: "https://oauth.deriv.com/oauth2/token",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        app_id: process.env.DERIV_APP_ID,
        redirect_uri: `${process.env.BASE_URL}/api/callback`
      }).toString()
    });

    const token = tokenResp.data.access_token;
    if (!token) return res.status(500).send("Não foi possível obter access_token.");

    // Envia token ao server do bot (Railway) para iniciar automaticamente
    await axios.post(`${process.env.BOT_SERVER_URL}/api/start-bot`, { token });

    return res.send(`
      <h2>✅ Conectado com sucesso!</h2>
      <p>O Gms Trader foi iniciado. Pode fechar esta aba.</p>
    `);
  } catch (err) {
    console.error("Erro no callback:", err.response?.data || err.message);
    return res.status(500).send("Erro ao processar OAuth.");
  }
}
