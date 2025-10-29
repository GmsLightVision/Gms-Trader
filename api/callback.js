import axios from "axios";

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send("Código OAuth ausente.");

  try {
    const response = await axios.get(
      `https://oauth.deriv.com/token?app_id=${process.env.DERIV_APP_ID}&grant_type=authorization_code&code=${code}`
    );
    const token = response.data.access_token;

    // Envia o token ao servidor do bot (Railway)
    await axios.post(`${process.env.BOT_SERVER_URL}/api/start-bot`, { token });

    return res.send("✅ Login concluído! O bot Gms Trader foi iniciado.");
  } catch (err) {
    console.error("Erro no callback:", err.response?.data || err.message);
    return res.status(500).send("Erro ao trocar o código OAuth por token.");
  }
}
