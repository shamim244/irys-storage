import { uploadTokenAssets } from '../old/enhanced-token-uploader.js';

const createMyToken = async () => {
  const tokenData = {
    name: "My Awesome Token",
    symbol: "MAT", 
    description: "The most awesome token on Solana",
    logoPath: "./dog.jpg", // ✅ Will correctly detect as JPEG
    website: "https://myawesometoken.com",
    attributes: [
      { trait_type: "Type", value: "Utility" },
      { trait_type: "Network", value: "Solana" }
    ]
  };
  
  const result = await uploadTokenAssets(tokenData);
  console.log('Token ready!', result);
  
  // ✅ Verify the fix by fetching metadata
  console.log('\n📄 Fetching generated metadata to verify...');
  const response = await fetch(result.metadataURL);
  const metadata = await response.json();
  console.log('Generated metadata:', JSON.stringify(metadata, null, 2));
};

createMyToken();
