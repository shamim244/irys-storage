import express from 'express';
import multer from 'multer';
import { createTokenAssets, checkFileSize, MAX_UPLOAD_SIZE } from './irys-token-creator.js';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// 🔒 APPLY SIZE RESTRICTIONS FROM .env
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: MAX_UPLOAD_SIZE,
    fieldSize: 1024 * 1024 // 1MB for text fields
  }
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

console.log(`🔒 API Server: Max upload size set to ${(MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB`);

// 🎯 CREATE TOKEN WITH SIZE VALIDATION
app.post('/create-token', upload.single('logo'), async (req, res) => {
  const requestStart = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'Logo file required',
        maxSize: `${(MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB`
      });
    }
    
    // Check if file exceeds size limit
    if (req.file.size > MAX_UPLOAD_SIZE) {
      return res.status(413).json({
        error: 'File too large',
        fileSize: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
        maxAllowed: `${(MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB`
      });
    }
    
    // Save uploaded file temporarily
    const logoPath = `./temp_${Date.now()}_${req.file.originalname}`;
    require('fs').writeFileSync(logoPath, req.file.buffer);
    
    // Pre-validate file size
    const sizeCheck = checkFileSize(logoPath);
    if (!sizeCheck.valid) {
      require('fs').unlinkSync(logoPath);
      return res.status(400).json({
        error: 'File validation failed',
        details: sizeCheck.error
      });
    }
    
    const tokenData = {
      name: req.body.name,
      symbol: req.body.symbol,
      description: req.body.description,
      logoPath: logoPath,
      website: req.body.website,
      attributes: JSON.parse(req.body.attributes || '[]')
    };
    
    console.log(`🪙 API: Creating token ${tokenData.symbol} (${sizeCheck.sizeMB}MB logo)...`);
    
    const result = await createTokenAssets(tokenData);
    
    // Cleanup
    require('fs').unlinkSync(logoPath);
    
    const totalRequestTime = Date.now() - requestStart;
    
    if (result.success) {
      res.json({
        success: true
