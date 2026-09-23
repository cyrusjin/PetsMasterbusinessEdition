// Run with: NODE_PATH=/tmp/petmaster-icon-tools/node_modules node scripts/optimize-static-images.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..', 'miniprogram', 'images');
const folders = ['home', 'booking'];
async function main() {
  for (const folder of folders) {
    for (const filename of fs.readdirSync(path.join(root, folder))) {
      if (!filename.endsWith('.png') || filename.startsWith('._')) continue;
      const file = path.join(root, folder, filename);
      const source = fs.readFileSync(file);
      const optimized = await sharp(source).png({ palette: true, quality: 92, effort: 10 }).toBuffer();
      if (optimized.length < source.length * .85) {
        fs.writeFileSync(file, optimized);
        console.log(`${folder}/${filename}: ${source.length} → ${optimized.length} bytes`);
      }
    }
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
