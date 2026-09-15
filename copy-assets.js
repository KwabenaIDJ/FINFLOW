// Import file system module
const fs = require('fs');
// Import path resolution module
const path = require('path');

// Target directory for Capacitor web output
const wwwDir = path.join(__dirname, 'www');
// Target directory for Android assets folder
const androidDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');

// List of core web assets to synchronize across build targets
const assetsToCopy = [
  // Primary HTML entry file
  'index.html',
  // Main frontend application logic script
  'app.js',
  // State management and local storage store script
  'store.js',
  // Main dashboard layout and component stylesheet
  'styles.css',
  // Chart rendering and visualization engine script
  'charts.js',
  // Privacy policy HTML page
  'privacy.html',
  // Refund policy HTML page
  'refund.html',
  // Terms of service HTML page
  'terms.html',
  // Main application favicon icon
  'favicon.png',
  // 32x32 size favicon icon
  'favicon-32.png',
  // Apple touch home screen icon
  'apple-touch-icon.png',
  // 512x512 PWA and Android application launcher icon
  'icon-512.png'
// End assets list
];

// Ensure www target directory exists
if (!fs.existsSync(wwwDir)) {
  // Create www directory recursively
  fs.mkdirSync(wwwDir, { recursive: true });
// End www dir check
}

// Ensure Android public assets directory exists
if (!fs.existsSync(androidDir)) {
  // Create android public assets directory recursively
  fs.mkdirSync(androidDir, { recursive: true });
// End android dir check
}

// Iterate through each asset file to copy
assetsToCopy.forEach(fileName => {
  // Compute absolute path of source file in project root
  const rootFilePath = path.join(__dirname, fileName);
  // Check if source file exists in root directory
  if (fs.existsSync(rootFilePath)) {
    // Copy file from root to www directory
    fs.copyFileSync(rootFilePath, path.join(wwwDir, fileName));
    // Copy file from root to Android assets public directory
    fs.copyFileSync(rootFilePath, path.join(androidDir, fileName));
    // Log individual file copy success
    console.log(`Synced ${fileName} -> www/ & android/.../public/`);
  // End exists check
  }
// End asset loop
});

// Log overall synchronization success message
console.log('✅ Successfully synchronized all root assets to www/ and Android assets directory!');
