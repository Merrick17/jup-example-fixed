import fetch from "node-fetch";
import JSBI from "jsbi";
import { Connection, PublicKey, Keypair, Cluster } from "@solana/web3.js";
import {
  getPlatformFeeAccounts,
  Jupiter,
  RouteInfo,
  TOKEN_LIST_URL,
} from "@jup-ag/core";
import { generateKeyPair } from "./utils/wallet";
import { Decimal } from "decimal.js";
require("dotenv").config();
const SOLANA_RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || "";
const ENV = process.env.ENV || "mainnet-beta";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const wallet = generateKeyPair(PRIVATE_KEY);
const inputSymbol = process.env.INPUT_TOKEN || "SOL";
const outputSymbol = process.env.OUTPUT_TOKEN || "USDC";
const amount = process.env.AMOUNT ? Number(process.env.AMOUNT) : 1;
export interface Token {
  chainId: number; // 101,
  address: string; // '8f9s1sUmzUbVZMoMh6bufMueYH1u4BJSM57RCEvuVmFp',
  symbol: string; // 'TRUE',
  name: string; // 'TrueSight',
  decimals: number; // 9,
  logoURI: string; // 'https://i.ibb.co/pKTWrwP/true.jpg',
  tags: string[]; // [ 'utility-token', 'capital-token' ]
}
const getPossiblePairsTokenInfo = ({
  tokens,
  routeMap,
  inputToken,
}: {
  tokens: Token[];
  routeMap: Map<string, string[]>;
  inputToken?: Token;
}) => {
  try {
    if (!inputToken) {
      return {};
    }

    const possiblePairs = inputToken
      ? routeMap.get(inputToken.address) || []
      : []; // return an array of token mints that can be swapped with SOL
    const possiblePairsTokenInfo: { [key: string]: Token | undefined } = {};
    possiblePairs.forEach((address) => {
      possiblePairsTokenInfo[address] = tokens.find((t) => {
        return t.address == address;
      });
    });
    // Perform your conditionals here to use other outputToken
    // const alternativeOutputToken = possiblePairsTokenInfo[USDT_MINT_ADDRESS]
    return possiblePairsTokenInfo;
  } catch (error) {
    throw error;
  }
};

const getRoutes = async ({
  jupiter,
  inputToken,
  outputToken,
  inputAmount,
  slippageBps,
}: {
  jupiter: Jupiter;
  inputToken?: Token;
  outputToken?: Token;
  inputAmount: number;
  slippageBps: number;
}) => {
  try {
    if (!inputToken || !outputToken) {
      return null;
    }

    console.log(
      `Getting routes for ${inputAmount} ${inputToken.symbol} -> ${outputToken.symbol}...`
    );
    const inputAmountInSmallestUnits = inputToken
      ? Math.round(inputAmount * 10 ** inputToken.decimals)
      : 0;

    const routes =
      inputToken && outputToken
        ? await jupiter.computeRoutes({
            inputMint: new PublicKey(inputToken.address),
            outputMint: new PublicKey(outputToken.address),
            amount: JSBI.BigInt(inputAmountInSmallestUnits), // raw input amount of tokens
            slippageBps,
            forceFetch: true,
          })
        : null;

    if (routes && routes.routesInfos) {
      //console.log("Possible number of routes:", routes.routesInfos.length);
      console.log(
        "Best quote: ",
        new Decimal(routes.routesInfos[0].outAmount.toString())
          .div(10 ** outputToken.decimals)
          .toString(),
        `(${outputToken.symbol})`
      );
      return routes;
    } else {
      return null;
    }
  } catch (error) {
    throw error;
  }
};

const executeSwap = async ({
  jupiter,
  routeInfo,
}: {
  jupiter: Jupiter;
  routeInfo: RouteInfo;
}) => {
  try {
    // Prepare execute exchange
    const { execute } = await jupiter.exchange({
      routeInfo,
    });

    // Execute swap
    const swapResult: any = await execute(); // Force any to ignore TS misidentifying SwapResult type

    if (swapResult.error) {
      console.log(swapResult.error);
    } else {
      console.log(`https://explorer.solana.com/tx/${swapResult.txid}`);
      console.log(
        `inputAddress=${swapResult.inputAddress.toString()} outputAddress=${swapResult.outputAddress.toString()}`
      );
      console.log(
        `inputAmount=${swapResult.inputAmount} outputAmount=${swapResult.outputAmount}`
      );
    }
  } catch (error) {
    throw error;
  }
};

const main = async () => {
  try {
    const connection = new Connection(SOLANA_RPC_ENDPOINT); // Setup Solana RPC connection
    const tokens: Token[] = await (
      await fetch(TOKEN_LIST_URL["mainnet-beta"])
    ).json(); // Fetch token list from Jupiter API

    //  Load Jupiter
    const jupiter = await Jupiter.load({
      connection,
      cluster: "mainnet-beta",
      user: wallet, // or public key
    });

    //  Get routeMap, which maps each tokenMint and their respective tokenMints that are swappable
    const routeMap = jupiter.getRouteMap();

    // If you know which input/output pair you want
    const inputToken = tokens.find((t) => t.symbol == inputSymbol); // USDC Mint Info
    const outputToken = tokens.find((t) => t.symbol == outputSymbol); // USDT Mint Info

    const routes = await getRoutes({
      jupiter,
      inputToken,
      outputToken,
      inputAmount: amount, // 1 unit in UI
      slippageBps: 100, // 1% slippage
    });
    if (routes && routes.routesInfos.length > 0 && outputToken) {
      let outputAmount: number = Number(
        new Decimal(routes.routesInfos[0].outAmount.toString())
          .div(10 ** outputToken.decimals)
          .toString()
      );
      if (outputAmount > amount) {
        console.log("Swap", outputAmount);
        await executeSwap({ jupiter, routeInfo: routes!.routesInfos[0] });
      }
    }

    // Routes are sorted based on outputAmount, so ideally the first route is the best.
  } catch (error) {
    console.log({ error });
  }
};

setInterval(() => {
  main();
}, 30 * 1000);
