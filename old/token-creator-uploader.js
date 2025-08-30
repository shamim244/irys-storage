import { fastUpload, batchUpload } from './optimized-token-uploader_v2.2.2.js';
import fs from 'fs';

// 🎯 TOKEN CREATOR: Upload token metadata + logo
const uploadTokenAssets = async (tokenData) => {
  console.log('🪙 Creating Solana Token Assets...');
  const startTime = Date.now();
  
  try {
    // 1. Create metadata JSON file
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
          type: "image/png"
        }],
        category: "image",
        creators: tokenData.creators || []
      }
    };
    
    // Write metadata to temp file
    const metadataPath = './temp_metadata.json';
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    // 2. Upload logo first (parallel with metadata prep)
    console.log('📸 Uploading token logo...');
    const logoResult = await fastUpload(tokenData.logoPath, [
      { name: "Asset-Type", value: "token-logo" },
      { name: "Token-Symbol", value: tokenData.symbol },
      { name: "Token-Name", value: tokenData.name }
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
      { name: "Token-Name", value: tokenData.name }
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
      totalTime: totalTime
    };
    
  } catch (error) {
    console.error('❌ Token asset upload failed:', error.message);
    throw error;
  }
};

// 🎯 TOKEN CREATOR: Batch upload multiple token assets
const uploadMultipleTokens = async (tokensData) => {
  console.log(`🚀 Creating ${tokensData.length} tokens...`);
  
  const results = [];
  for (const tokenData of tokensData) {
    try {
      const result = await uploadTokenAssets(tokenData);
      results.push({ success: true, ...result, tokenData });
    } catch (error) {
      results.push({ success: false, error: error.message, tokenData });
    }
  }
  
  return results;
};

export { uploadTokenAssets, uploadMultipleTokens };
