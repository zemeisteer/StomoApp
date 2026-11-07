const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="90" viewBox="0 0 360 90">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#167b78"/>
      <stop offset="100%" stop-color="#2bb49c"/>
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="70" height="70" rx="20" fill="url(#grad)"/>
  <!-- Stylized Tooth -->
  <path d="M45 25 C37 25 31 31 31 39 C31 46 33 53 36 60 C37.5 63 41 63 42 59 C43 55 47 55 48 59 C49 63 52.5 63 54 60 C57 53 59 46 59 39 C59 31 53 25 45 25 Z" fill="white"/>
  <!-- Medical Cross Accent -->
  <path d="M55 24 L59 24 L59 28 L63 28 L63 32 L59 32 L59 36 L55 36 L55 32 L51 32 L51 28 L55 28 Z" fill="#ffd166"/>
  <!-- Text Brand -->
  <text x="96" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="800" fill="#152f34" letter-spacing="-0.5">Denta<tspan fill="#167b78">Care</tspan></text>
  <text x="98" y="68" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="700" fill="#52696e" letter-spacing="2">STOMATOLOGIYA KLINIKASI</text>
</svg>`;

async function main() {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const destPath = path.join(uploadsDir, 'verified-logo.png');
  await sharp(Buffer.from(svg)).png().toFile(destPath);
  console.log('Successfully generated logo at:', destPath);
}

main().catch(console.error);
