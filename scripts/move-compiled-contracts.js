const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../artifacts/contracts');
const destDir = path.join(__dirname, '../build/contracts');

function copyJsonFiles(dir) {
  fs.readdir(dir, (err, files) => {
    if (err) {
      console.error(err);
      return;
    }

    files.forEach((filename) => {
      const filePath = path.join(dir, filename);

      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error(err);
          return;
        }

        if (stats.isDirectory()) {
          copyJsonFiles(filePath);
        } else if (filename.endsWith('.json')) {
          const destPath = path.join(destDir, filename);
          fs.copyFileSync(filePath, destPath);
        }
      });
    });
  });
}


if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

copyJsonFiles(sourceDir);