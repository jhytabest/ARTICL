/**
 * ARTICL publisher middleware (EIP-712 call flow).
 *
 * Expects a request payload containing:
 * {
 *   buyer: string;
 *   apiId: string | number;
 *   amount: string | number;
 *   nonce: string | number;
 *   signature: string;
 * }
 *
 * The middleware:
 *  - Rebuilds the typed data domain (chainId + marketplace address)
 *  - Verifies the signature recovers the buyer
 *  - Cross-checks digest with marketplace.hashCall (optional but recommended)
 *  - Optionally enforces allowance/balance sanity checks
 *  - Optionally calls redeemCall on-chain (autoRedeem)
 */

import { Request, Response, NextFunction } from "express";
import { Contract, Signer, TypedDataEncoder, ethers } from "ethers";
import { CALL_TYPED_DATA } from "../client-sdk/src";
import marketplaceAbi from "../client-sdk/src/abi.marketplace.json";
import tokenAbi from "../client-sdk/src/abi.token.json";

export interface CallPayload {
  buyer: string;
  apiId: string | number;
  amount: string | number;
  nonce: string | number;
  signature: string;
}

export interface ARTICLMiddlewareConfig {
  marketplaceAddress: string;
  tokenAddress: string;
  provider: ethers.Provider;
  signer?: Signer; // required if autoRedeem
  autoRedeem?: boolean;
  allowlistApiIds?: bigint[]; // optional filtering
  onRequest?: (payload: CallPayload, req: Request) => void;
  onValid?: (payload: CallPayload, req: Request) => void;
  onInvalid?: (reason: string, payload: Partial<CallPayload>, req: Request) => void;
}

function parsePayload(req: Request): CallPayload | null {
  const body = (req.body?.articl || req.body) as Partial<CallPayload>;
  if (!body || !body.signature) return null;
  if (body.buyer && body.apiId !== undefined && body.amount !== undefined && body.nonce !== undefined) {
    return body as CallPayload;
  }
  return null;
}

export function createARTICLMiddleware(config: ARTICLMiddlewareConfig) {
  const marketplace = new Contract(config.marketplaceAddress, marketplaceAbi, config.provider);
  const token = new Contract(config.tokenAddress, tokenAbi, config.provider);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = parsePayload(req);
      if (!payload) {
        return res.status(401).json({ error: "Missing ARTICL payload" });
      }

      config.onRequest?.(payload, req);

      const apiId = BigInt(payload.apiId);
      const amount = BigInt(payload.amount);
      const nonce = BigInt(payload.nonce);

      if (config.allowlistApiIds && !config.allowlistApiIds.includes(apiId)) {
        config.onInvalid?.("API not allowlisted", payload, req);
        return res.status(403).json({ error: "API not allowed" });
      }

      const { chainId } = await marketplace.provider.getNetwork();
      const domain = {
        name: "ARTICLMarketplace",
        version: "1",
        chainId,
        verifyingContract: config.marketplaceAddress,
      };

      const message = {
        buyer: payload.buyer,
        apiId,
        amount,
        nonce,
      };

      // Recover signer
      const recovered = ethers.verifyTypedData(domain, CALL_TYPED_DATA, message, payload.signature);
      if (recovered.toLowerCase() !== payload.buyer.toLowerCase()) {
        config.onInvalid?.("Signature does not match buyer", payload, req);
        return res.status(403).json({ error: "Invalid signature" });
      }

      // Cross-check digest with on-chain hashCall
      const typedDigest = TypedDataEncoder.hash(domain, CALL_TYPED_DATA, message);
      const onchainDigest = await marketplace.hashCall(payload.buyer, apiId, amount, nonce);
      if (typedDigest !== onchainDigest) {
        config.onInvalid?.("Digest mismatch", payload, req);
        return res.status(403).json({ error: "Digest mismatch" });
      }

      // Optional allowance/balance pre-check to avoid revert in redeemCall
      const [allowance, balance] = await Promise.all([
        token.allowance(payload.buyer, config.marketplaceAddress),
        token.balanceOf(payload.buyer),
      ]);
      if (allowance < amount || balance < amount) {
        config.onInvalid?.("Insufficient allowance/balance", payload, req);
        return res.status(402).json({ error: "Insufficient allowance or balance" });
      }

      // Optional: redeem on-chain immediately
      if (config.autoRedeem) {
        const signer = config.signer;
        if (!signer) throw new Error("autoRedeem enabled but no signer provided");
        const tx = await marketplace.connect(signer).redeemCall({
          buyer: payload.buyer,
          apiId,
          amount,
          nonce,
          signature: payload.signature,
        });
        await tx.wait();
      }

      config.onValid?.(payload, req);
      next();
    } catch (error) {
      console.error("ARTICL middleware error:", error);
      config.onInvalid?.((error as Error).message, req.body ?? {}, req);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
