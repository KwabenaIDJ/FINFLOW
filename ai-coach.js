// Vercel Serverless Function: Google Gemini 1.5 Flash AI Coach & Vision OCR Scanner
// Export asynchronous request handler function for Vercel
module.exports = async function handler(req, res) {
  // Set CORS credentials header
  res.setHeader('Access-Control-Allow-Credentials', true);
  // Set CORS origin header to allow all clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Set allowed HTTP request methods
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  // Set allowed request headers
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle HTTP OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    // Respond with HTTP status 200 OK
    res.status(200).end();
    // Exit handler early
    return;
  // End OPTIONS check
  }

  // Enforce HTTP POST method
  if (req.method !== 'POST') {
    // Return 405 Method Not Allowed error
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  // End method check
  }

  // Retrieve Gemini API Key from environment variables
  const apiKey = process.env.GEMINI_API_KEY;
  // Verify that API key exists on the server environment
  if (!apiKey) {
    // Return 500 error if API key is not configured
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured on server.' });
  // End API key check
  }

  // Extract prompt, systemInstruction, imageData, and mimeType from request body
  const { prompt, systemInstruction, imageData, mimeType } = req.body || {};
  // Verify that prompt is provided
  if (!prompt) {
    // Return 400 Bad Request error
    return res.status(400).json({ error: 'Missing prompt in request body.' });
  // End prompt validation
  }

  // Initialize parts array with text prompt
  const parts = [{ text: prompt }];
  // Check if base64 encoded image data is included in payload
  if (imageData) {
    // Add inline_data object to parts array for Gemini Vision
    parts.push({
      // Inline data wrapper object
      inline_data: {
        // Image MIME type
        mime_type: mimeType || 'image/jpeg',
        // Base64 encoded image string
        data: imageData
      // End inline_data object
      }
    // End push
    });
  // End imageData check
  }

  // Build Gemini API payload object
  const geminiPayload = {
    // Contents structure
    contents: [{ parts: parts }]
  // End geminiPayload object
  };

  // Add system instruction if provided in request
  if (systemInstruction) {
    // Assign system instruction parts
    geminiPayload.systemInstruction = { parts: [{ text: systemInstruction }] };
  // End systemInstruction check
  }

  // Set response MIME type to application/json for OCR image requests
  if (imageData) {
    // Configure response MIME type
    geminiPayload.generationConfig = { response_mime_type: 'application/json' };
  // End imageData check
  }

  // Try calling Google Gemini 1.5 Flash endpoint
  try {
    // Target Google Gemini REST API URL
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    // Send HTTP POST request
    const response = await fetch(geminiUrl, {
      // POST method
      method: 'POST',
      // Content-Type header
      headers: { 'Content-Type': 'application/json' },
      // Serialize payload as JSON
      body: JSON.stringify(geminiPayload)
    // End fetch
    });

    // Check if Gemini API request succeeded
    if (!response.ok) {
      // Parse upstream error details
      const errData = await response.json().catch(() => ({}));
      // Return upstream error message and status
      return res.status(response.status).json({ error: errData?.error?.message || `Gemini API error ${response.status}` });
    // End status check
    }

    // Parse JSON response from Gemini
    const data = await response.json();
    // Extract text content from candidates
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Return extracted text to client
    return res.status(200).json({ text: text });
  // Catch any unexpected runtime errors
  } catch (error) {
    // Return 500 error with message
    return res.status(500).json({ error: error.message || 'Internal server error while calling Gemini API.' });
  // End try-catch block
  }
// End handler definition
};
