import { describe, it, expect, vi, beforeEach } from "vitest";
import { ethers } from "ethers";
import { ARTICLClient, CALL_TYPED_DATA } from "../ARTICLClient";

// Mock addresses
const TOKEN_ADDRESS = "0x1234567890123456789012345678901234567890";
const MARKETPLACE_ADDRESS = "0x0987654321098765432109876543210987654321";
const USER_ADDRESS = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const PUBLISHER_ADDRESS = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

// Create mock provider
function createMockProvider() {
  return {
    getNetwork: vi.fn().mockResolvedValue({ chainId: 8453n }),
    call: vi.fn(),
    estimateGas: vi.fn(),
    getBalance: vi.fn(),
  } as unknown as ethers.Provider;
}

// Create mock signer
function createMockSigner(address: string = USER_ADDRESS) {
  return {
    getAddress: vi.fn().mockResolvedValue(address),
    signTypedData: vi.fn().mockResolvedValue(
      "0x" + "ab".repeat(65)
    ),
    provider: createMockProvider(),
  } as unknown as ethers.Signer;
}

describe("ARTICLClient", () => {
  let provider: ethers.Provider;
  let signer: ethers.Signer;
  let client: ARTICLClient;

  beforeEach(() => {
    provider = createMockProvider();
    signer = createMockSigner();
    client = new ARTICLClient({
      tokenAddress: TOKEN_ADDRESS,
      marketplaceAddress: MARKETPLACE_ADDRESS,
      provider,
    });
  });

  describe("constructor", () => {
    it("should initialize with correct addresses", () => {
      expect(client.tokenAddress).toBe(TOKEN_ADDRESS);
      expect(client.marketplaceAddress).toBe(MARKETPLACE_ADDRESS);
    });
  });

  describe("connect", () => {
    it("should return a new client instance with signer attached", () => {
      const connected = client.connect(signer);
      expect(connected).toBe(client); // same instance, mutated
    });
  });

  describe("domain", () => {
    it("should return correct EIP-712 domain", async () => {
      const domain = await client.domain();
      
      expect(domain.name).toBe("ARTICLMarketplace");
      expect(domain.version).toBe("1");
      expect(domain.chainId).toBe(8453n);
      expect(domain.verifyingContract).toBe(MARKETPLACE_ADDRESS);
    });
  });

  describe("CALL_TYPED_DATA", () => {
    it("should export correct EIP-712 types", () => {
      expect(CALL_TYPED_DATA).toHaveProperty("Call");
      expect(CALL_TYPED_DATA.Call).toEqual([
        { name: "buyer", type: "address" },
        { name: "apiId", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ]);
    });
  });

  describe("signCall", () => {
    it("should require a signer", async () => {
      const clientWithoutSigner = new ARTICLClient({
        tokenAddress: TOKEN_ADDRESS,
        marketplaceAddress: MARKETPLACE_ADDRESS,
        provider,
      });

      await expect(
        clientWithoutSigner.signCall({
          apiId: 1n,
          amount: 1000n,
          nonce: 1n,
        })
      ).rejects.toThrow("Signer required");
    });

    it("should call signer.signTypedData with correct params", async () => {
      const connectedClient = client.connect(signer);
      
      const result = await connectedClient.signCall({
        apiId: 1n,
        amount: 1000n,
        nonce: 42n,
      });

      expect(signer.signTypedData).toHaveBeenCalled();
      expect(result.buyer).toBe(USER_ADDRESS);
      expect(result.apiId).toBe(1n);
      expect(result.amount).toBe(1000n);
      expect(result.nonce).toBe(42n);
      expect(result.signature).toBeDefined();
    });

    it("should use provided buyer address", async () => {
      const connectedClient = client.connect(signer);
      
      const result = await connectedClient.signCall({
        buyer: PUBLISHER_ADDRESS,
        apiId: 1n,
        amount: 1000n,
        nonce: 1n,
      });

      expect(result.buyer).toBe(PUBLISHER_ADDRESS);
    });
  });

  describe("recoverCallSigner", () => {
    it("should recover signer from valid signature", async () => {
      const wallet = ethers.Wallet.createRandom();
      const walletProvider = {
        getNetwork: vi.fn().mockResolvedValue({ chainId: 8453n }),
      } as unknown as ethers.Provider;

      const testClient = new ARTICLClient({
        tokenAddress: TOKEN_ADDRESS,
        marketplaceAddress: MARKETPLACE_ADDRESS,
        provider: walletProvider,
      }).connect(wallet);

      const call = {
        buyer: wallet.address,
        apiId: 1n,
        amount: 5000n,
        nonce: 99n,
      };

      const domain = await testClient.domain();
      const signature = await wallet.signTypedData(domain, CALL_TYPED_DATA, call);
      
      const recovered = await testClient.recoverCallSigner(call, signature);
      expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase());
    });
  });
});

describe("ARTICLClient - error handling", () => {
  it("should throw on mint without signer", async () => {
    const provider = createMockProvider();
    const client = new ARTICLClient({
      tokenAddress: TOKEN_ADDRESS,
      marketplaceAddress: MARKETPLACE_ADDRESS,
      provider,
    });

    await expect(client.mint(USER_ADDRESS, 1000000000000000000n)).rejects.toThrow("Signer required");
  });

  it("should throw on redeem without signer", async () => {
    const provider = createMockProvider();
    const client = new ARTICLClient({
      tokenAddress: TOKEN_ADDRESS,
      marketplaceAddress: MARKETPLACE_ADDRESS,
      provider,
    });

    await expect(client.redeem(1000n, USER_ADDRESS)).rejects.toThrow("Signer required");
  });

  it("should throw on approveMarketplace without signer", async () => {
    const provider = createMockProvider();
    const client = new ARTICLClient({
      tokenAddress: TOKEN_ADDRESS,
      marketplaceAddress: MARKETPLACE_ADDRESS,
      provider,
    });

    await expect(client.approveMarketplace(1000n)).rejects.toThrow("Signer required");
  });
});
