// Simple local HTTP static server for testing FinFlow dashboard locally
const http = require('http'); // HTTP server module
const fs = require('fs'); // File system module
const path = require('path'); // Path utility module

const PORT = 8080; // Local test port
const WWW_DIR = path.join(__dirname, 'www'); // Target web asset directory

// Map file extensions to MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// Create local HTTP server
const server = http.createServer((req, res) => {
  const reqUrl = req.url.split('?')[0]; // Strip query parameters
  let filePath = path.join(WWW_DIR, reqUrl === '/' ? 'index.html' : reqUrl); // Resolve target file path
  const ext = path.extname(filePath).toLowerCase(); // Extract file extension

  fs.readFile(filePath, (err, content) => { // Read file content
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); // 404 Not Found response
      res.end('404 Not Found'); // End response
    } else {
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' }); // 200 OK with MIME type
      res.end(content); // Serve file content
    }
  });
});

// Start listening on localhost:8080
server.listen(PORT, () => {
  console.log('FinFlow Local Server running on http://localhost:' + PORT);
});
