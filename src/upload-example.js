// src/upload-example.js
import { createTokenAssets } from './irys-upload-service-final.js';

const uploadToken = async () => {
  const tokenData = {
    name: "My Token",
    symbol: "MT",
    description: "Amazing utility token",
    logoPath: "./dog.jpg",  // Your image file
    website: "https://mytoken.com",
    attributes: [
      { trait_type: "Type", value: "Utility" },
      { trait_type: "Network", value: "Solana" }
    ]
  };

  try {
    const result = await createTokenAssets(tokenData);
    
    console.log('✅ Token Created!');
    console.log('Logo URL:', result.logoURL);
    console.log('Metadata URL:', result.metadataURL);
    
    return result;
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
  }
};

uploadToken();
