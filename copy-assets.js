const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'www');
const androidDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      if (['app.js', 'store.js', 'index.html', 'styles.css', 'charts.js'].includes(entry.name)) {
        fs.copyFileSync(srcPath, path.join(__dirname, entry.name));
      }
    }
  }
}

try {
  copyDirSync(srcDir, androidDir);
  console.log('✅ Successfully synchronized web assets to Android build directory & root!');
} catch (err) {
  console.error('❌ Failed to copy assets:', err);
}
