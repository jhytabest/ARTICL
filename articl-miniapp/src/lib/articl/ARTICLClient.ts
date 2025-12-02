import { Provider, Signer, TypedDataDomain, TypedDataField, ethers } from "ethers";
import marketplaceAbi from "./abi.marketplace.json";
import tokenAbi from "./abi.token.json";

export interface ARTICLConfig {
  tokenAddress: string;
  marketplaceAddress: string;
  provider: Provider;
  signer?: Signer;
}

export interface ApiOffering {
  id: bigint;
  publisher: string;
  name: string;
  metadataURI: string;
  recommendedPrice: bigint;
  exists: boolean;
}

export interface CallAuthorization {
  buyer: string;
  apiId: bigint;
  amount: bigint;
  nonce: bigint;
}

export interface SignedCall extends CallAuthorization {
  signature: string;
}

const CALL_TYPES: Record<string, TypedDataField[]> = {
  Call: [
    { name: "buyer", type: "address" },
    { name: "apiId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
};

export const ARTICL_DECIMALS = 0;
export const ARTICL_CONVERSION_FACTOR = 100_000_000n; // ARTICL per 1 ETH

/**
 * ARTICL SDK (frontend-friendly): wraps the ARTICL ERC20 and marketplace contracts.
 */
export class ARTICLClient {
  public readonly tokenAddress: string;
  public readonly marketplaceAddress: string;

  private token: ethers.Contract;
  private marketplace: ethers.Contract;
  private provider: Provider;
  private signer?: Signer;

  constructor(config: ARTICLConfig) {
    this.provider = config.provider;
    this.tokenAddress = config.tokenAddress;
    this.marketplaceAddress = config.marketplaceAddress;
    this.token = new ethers.Contract(config.tokenAddress, tokenAbi, config.provider);
    this.marketplace = new ethers.Contract(config.marketplaceAddress, marketplaceAbi, config.provider);
    this.signer = config.signer;
  }

  /**
   * Attach a signer to enable state-changing calls.
   */
  connect(signer: Signer): ARTICLClient {
    this.signer = signer;
    this.token = this.token.connect(signer) as ethers.Contract;
    this.marketplace = this.marketplace.connect(signer) as ethers.Contract;
    return this;
  }

  /**
   * Detach signer and revert to read-only provider.
   */
  disconnect(provider?: Provider): ARTICLClient {
    if (provider) {
      this.provider = provider;
    }
    this.signer = undefined;
    this.token = new ethers.Contract(this.tokenAddress, tokenAbi, this.provider);
    this.marketplace = new ethers.Contract(this.marketplaceAddress, marketplaceAbi, this.provider);
    return this;
  }

  /**
   * Mint ARTICL by sending ETH.
   */
  async mint(to: string, ethAmount: bigint) {
    const signer = await this.requireSigner();
    return this.token.connect(signer).mint(to, { value: ethAmount });
  }

  /**
   * Redeem ARTICL back to ETH.
   */
  async redeem(amount: bigint, to: string) {
    const signer = await this.requireSigner();
    return this.token.connect(signer).redeem(amount, to);
  }

  async balanceOf(address: string): Promise<bigint> {
    return this.token.balanceOf(address);
  }

  async approveMarketplace(amount: bigint) {
    const signer = await this.requireSigner();
    return this.token.connect(signer).approve(this.marketplaceAddress, amount);
  }

  async allowance(owner: string, spender?: string): Promise<bigint> {
    return this.token.allowance(owner, spender ?? this.marketplaceAddress);
  }

  // ============ Marketplace ============

  async registerApi(name: string, metadataURI: string, recommendedPrice: bigint) {
    const signer = await this.requireSigner();
    return this.marketplace.connect(signer).registerApi(name, metadataURI, recommendedPrice);
  }

  async updateApi(apiId: bigint, metadataURI: string, recommendedPrice: bigint) {
    const signer = await this.requireSigner();
    return this.marketplace.connect(signer).updateApi(apiId, metadataURI, recommendedPrice);
  }

  async getApi(apiId: bigint): Promise<ApiOffering> {
    const [publisher, name, metadataURI, recommendedPrice, exists] = await this.marketplace.apis(apiId);
    return { id: apiId, publisher, name, metadataURI, recommendedPrice, exists };
  }

  async redeemCallOnChain(call: SignedCall) {
    const signer = await this.requireSigner();
    return this.marketplace.connect(signer).redeemCall(call);
  }

  async redeemCallsOnChain(calls: SignedCall[]) {
    const signer = await this.requireSigner();
    return this.marketplace.connect(signer).redeemCalls(calls);
  }

  async isNonceUsed(buyer: string, nonce: bigint): Promise<boolean> {
    return this.marketplace.usedNonces(buyer, nonce);
  }

  // ============ Signatures ============

  /**
   * Return EIP-712 domain for the marketplace.
   */
  async domain(): Promise<TypedDataDomain> {
    const { chainId } = await this.provider.getNetwork();
    return {
      name: "ARTICLMarketplace",
      version: "1",
      chainId,
      verifyingContract: this.marketplaceAddress,
    };
  }

  /**
   * Create a SignedCall using the connected signer. buyer defaults to signer address.
   */
  async signCall(params: Omit<CallAuthorization, "buyer"> & { buyer?: string }): Promise<SignedCall> {
    const signer = await this.requireSigner();
    const buyer = params.buyer ?? (await signer.getAddress());
    const message: CallAuthorization = {
      buyer,
      apiId: params.apiId,
      amount: params.amount,
      nonce: params.nonce,
    };

    const signature = await signer.signTypedData(await this.domain(), CALL_TYPES, message);
    return { ...message, signature };
  }

  /**
   * Recover the signer of a call authorization (off-chain verification).
   */
  async recoverCallSigner(call: CallAuthorization, signature: string): Promise<string> {
    return ethers.verifyTypedData(await this.domain(), CALL_TYPES, call, signature);
  }

  /**
   * Computes the on-chain digest (matches marketplace.hashCall).
   */
  async hashCall(call: CallAuthorization): Promise<string> {
    return this.marketplace.hashCall(call.buyer, call.apiId, call.amount, call.nonce);
  }

  // ============ Helpers ============

  private async requireSigner(): Promise<Signer> {
    if (!this.signer) {
      throw new Error("Signer required for this operation");
    }
    return this.signer;
  }
}

export const CALL_TYPED_DATA = CALL_TYPES;
