const fs = require('fs');
const path = require('path');

function clearFolder(subFolder) {
  const folderPath = path.join(__dirname, '..', 'uploads', subFolder);
  if (!fs.existsSync(folderPath)) {
    console.log(`Folder not found: ${folderPath}`);
    return;
  }
  const files = fs.readdirSync(folderPath);
  files.forEach(f => {
    const full = path.join(folderPath, f);
    try {
      fs.unlinkSync(full);
      console.log(`Deleted: ${full}`);
    } catch (e) {
      console.error(`Could not delete ${full}: ${e.message}`);
    }
  });
}

clearFolder('generated');
clearFolder('reference');
console.log('Upload folders cleared.');
