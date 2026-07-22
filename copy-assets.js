const fs = require('fs');
const path = require('path');

const filesToCopy = [
  'index.html',
  'app.js',
  'charts.js',
  'store.js',
  'styles.css'
];

const destDir = path.join(__dirname, 'www');

// Create www directory if it doesn't exist
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir);
}

// Copy each file
filesToCopy.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to www/`);
  } else {
    console.warn(`Warning: ${file} not found in root.`);
  }
});
