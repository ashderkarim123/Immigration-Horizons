const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

const allowedExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const allowedMime = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const fileFilter = (req, file, cb) => {
  const extOk = allowedExt.includes(path.extname(file.originalname).toLowerCase());
  // Client-supplied mimetype isn't authoritative on its own, but checking it
  // alongside the extension catches the common case of a renamed non-image
  // file at near-zero cost — no magic-byte sniffing dependency needed.
  const mimeOk = allowedMime.includes(file.mimetype);
  if (extOk && mimeOk) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (png, jpg, jpeg, webp, gif).'));
  }
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });
