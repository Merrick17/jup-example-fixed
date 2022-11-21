import {Keypair} from '@solana/web3.js'
import * as bs58 from 'bs58' ; 
const generateKeyPair = (secretKey:string):Keypair => {
  let seed = bs58.decode(secretKey);

  const keyPair = Keypair.fromSecretKey(seed);

  return keyPair;
};

export {generateKeyPair}
