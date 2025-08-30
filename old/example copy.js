import { uploadTokenAssets } from './token-creator-uploader.js';

const createMyToken = async () => {
  const tokenData = {
    name: "My Awesome Token",
    symbol: "MAT",
    description: "The most awesome token on Solana",
    logoPath: "./dog.jpg",
    website: "https://myawesometoken.com",
    attributes: [
      { trait_type: "Type", value: "Utility" },
      { trait_type: "Network", value: "Solana" }
    ]
  };
  
  const result = await uploadTokenAssets(tokenData);
  console.log('Token ready!', result);
};

createMyToken();
