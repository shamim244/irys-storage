import { fastUpload, batchUpload } from './optimized-token-uploader_v2.2.2.js';
import fs from 'fs';
import path from 'path';

// 🎯 COMPREHENSIVE FILE TYPE MAPPING (Market Standard)
const FILE_TYPES = {
  // Images (Most Common for Tokens)
  ".jpg": { mime: "image/jpeg", type: "image/jpeg" },
  ".jpeg": { mime: "image/jpeg", type: "image/jpeg" },
  ".png": { mime: "image/png", type: "image/png" },
  ".gif": { mime: "image/gif", type: "image/gif" },
  ".webp": { mime: "image/webp", type: "image/webp" },
  ".svg": { mime: "image/svg+xml", type: "image/svg+xml" },
  ".bmp": { mime: "image/bmp", type: "image/bmp" },
  ".tiff": { mime: "image/tiff", type: "image/tiff" },
  ".avif": { mime: "image/avif", type: "image/avif" },
  ".ico": { mime: "image/x-icon", type: "image/x-icon" },
  
  // Videos (For Dynamic/Animated Tokens)
  ".mp4": { mime: "video/mp4", type: "video/mp4" },
  ".mov": { mime: "video/quicktime", type: "video/quicktime" },
  ".webm": { mime: "video/webm", type: "video/webm" },
  ".avi": { mime: "video/x-msvideo", type: "video/x-msvideo" },
  ".mkv": { mime: "video/x-matroska", type: "video/x-matroska" },
  
  // Audio (For Music Tokens)
  ".mp3": { mime: "audio/mpeg", type: "audio/mpeg" },
  ".wav": { mime: "audio/wav", type: "audio/wav" },
  ".flac": { mime: "audio/flac", type: "audio/flac" },
  ".ogg": { mime: "audio/ogg", type: "audio/ogg" },
  
  // Documents (For Utility Tokens)
  ".pdf": { mime: "application/pdf", type: "application/pdf" },
  ".json": { mime: "application/json", type: "application/json" },
  ".txt": { mime: "text/plain", type: "text/plain" },
  ".csv": { mime: "text/csv", type: "text/csv" }
};

// 🚀 EFFICIENT FILE TYPE DETECTION
const getFileType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const fileType = FILE_TYPES[ext];
  
  if (!fileType) {
    return {
      mime: "application/octet-stream",
      type: "application/octet-stream"
    };
  }
  
  return fileType;
};

// 🎯 FIXED TOKEN CREATOR: Upload token metadata + logo with correct types
const uploadTokenAssets = async (tokenData) => {
  console.log('🪙 Creating Solana Token Assets...');
  const startTime = Date.now();
  
  try {
    // ✅ DETECT ACTUAL FILE TYPE
    const logoFileType = getFileType(tokenData.logoPath);
    console.log(`📸 Detected logo type: ${logoFileType.type}`);
    
    // 1. Create metadata JSON structure
    const metadata = {
      name: tokenData.name,
      symbol: tokenData.symbol,
      description: tokenData.description,
      image: "", // Will be filled after logo upload
      external_url: tokenData.website || "",
      attributes: tokenData.attributes || [],
      properties: {
        files: [{
          uri: "", // Will be filled after logo upload
          type: logoFileType.type // ✅ FIXED: Use detected type instead of hardcoded
        }],
        category: logoFileType.mime.startsWith('image/') ? "image" : 
                 logoFileType.mime.startsWith('video/') ? "video" : 
                 logoFileType.mime.startsWith('audio/') ? "audio" : "file",
        creators: tokenData.creators || []
      }
    };
    
    // Write metadata to temp file
    const metadataPath = './temp_metadata.json';
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    // 2. Upload logo with correct content type
    console.log(`📸 Uploading ${logoFileType.type} logo...`);
    const logoResult = await fastUpload(tokenData.logoPath, [
      { name: "Asset-Type", value: "token-logo" },
      { name: "Token-Symbol", value: tokenData.symbol },
      { name: "Token-Name", value: tokenData.name },
      { name: "File-Type", value: logoFileType.type }
    ]);
    
    // 3. Update metadata with logo URL
    metadata.image = logoResult.publicURL;
    metadata.properties.files[0].uri = logoResult.publicURL;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    // 4. Upload metadata
    console.log('📄 Uploading token metadata...');
    const metadataResult = await fastUpload(metadataPath, [
      { name: "Asset-Type", value: "token-metadata" },
      { name: "Token-Symbol", value: tokenData.symbol },
      { name: "Token-Name", value: tokenData.name },
      { name: "Logo-Type", value: logoFileType.type }
    ]);
    
    // Cleanup
    fs.unlinkSync(metadataPath);
    
    const totalTime = Date.now() - startTime;
    console.log(`🎉 Token assets ready in ${totalTime}ms!`);
    
    return {
      logoURL: logoResult.publicURL,
      metadataURL: metadataResult.publicURL,
      logoTxId: logoResult.transactionId,
      metadataTxId: metadataResult.transactionId,
      logoType: logoFileType.type,
      category: metadata.properties.category,
      totalTime: totalTime
    };
    
  } catch (error) {
    console.error('❌ Token asset upload failed:', error.message);
    throw error;
  }
};

// 🚀 BATCH UPLOAD WITH TYPE VALIDATION
const uploadMultipleTokensEnhanced = async (tokensData) => {
  console.log(`🚀 Creating ${tokensData.length} tokens with type detection...`);
  
  const results = [];
  for (const tokenData of tokensData) {
    try {
      // Pre-validate file type
      const logoType = getFileType(tokenData.logoPath);
      console.log(`📋 ${tokenData.symbol}: ${logoType.type}`);
      
      const result = await uploadTokenAssets(tokenData);
      results.push({ 
        success: true, 
        ...result, 
        tokenData: {
          ...tokenData,
          detectedType: logoType.type
        }
      });
    } catch (error) {
      results.push({ 
        success: false, 
        error: error.message, 
        tokenData 
      });
    }
  }
  
  return results;
};

export { uploadTokenAssets, uploadMultipleTokensEnhanced, getFileType, FILE_TYPES };
