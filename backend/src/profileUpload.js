const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) }).single('file');

function profileUpload(directory) {
  return (req, res, next) => parser(req, res, async error => {
    if (error) return res.status(400).json({ error: 'Upload must be one image smaller than 6 MB' });
    if (!req.file) return res.status(400).json({ error: 'Choose a JPEG, PNG, or WebP image' });
    try {
      const image = sharp(req.file.buffer, { limitInputPixels: 16000000 });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Not an allowed image');
      const bytes = await image.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      const filename = `${crypto.randomUUID()}.jpg`;
      await fs.writeFile(path.join(directory, filename), bytes, { flag: 'wx' });
      req.file = { filename };
      return next();
    } catch (_) { return res.status(400).json({ error: 'The image could not be decoded. Choose a valid image under 16 megapixels.' }); }
  });
}
module.exports = { profileUpload };
