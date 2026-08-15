// Vercel Serverless Edge Function for FinFlow AI Money Coach
// Securely proxies Gemini 1.5 Flash API calls without exposing API keys to the browser.

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt, systemPrompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt text is required' });
  }

  // Retrieve Gemini API Key strictly from Vercel Environment Variables
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'GEMINI_API_KEY environment variable is not configured.' });
  }

  try {
    const fullPrompt = `${systemPrompt || ''}\n\nUser Question: ${prompt}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: fullPrompt }]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API Error' });
    }

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) {
      return res.status(500).json({ error: 'Empty response returned from Gemini API' });
    }

    return res.status(200).json({ text: aiText });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
}
