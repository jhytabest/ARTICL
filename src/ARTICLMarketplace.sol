// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ARTICL} from "./ARTICL.sol";

/**
 * @title ARTICL Marketplace
 * @notice Coordinates API payments using ARTICL tokens and buyer signatures.
 * @dev Uses EIP-712 signatures over (buyer, apiId, amount, nonce).
 */
contract ARTICLMarketplace {
    // ============ Structs ============

    struct ApiOffering {
        address publisher;
        string name;
        string metadataURI; // free-form metadata (includes recommended price hints)
        uint256 recommendedPrice;
        bool exists;
    }

    struct SignedCall {
        address buyer;
        uint256 apiId;
        uint256 amount;
        uint256 nonce;
        bytes signature;
    }

    struct _PreparedCall {
        address buyer;
        address publisher;
        uint256 apiId;
        uint256 amount;
        uint256 nonce;
    }

    // ============ Errors ============

    error ApiDoesNotExist();
    error NotPublisher();
    error AmountZero();
    error NonceAlreadyUsed();
    error InvalidSignature();
    error TransferFailed();

    // ============ Events ============

    event ApiRegistered(
        uint256 indexed apiId,
        address indexed publisher,
        string name,
        string metadataURI,
        uint256 recommendedPrice
    );

    event ApiUpdated(
        uint256 indexed apiId,
        string metadataURI,
        uint256 recommendedPrice
    );

    event CallRedeemed(
        address indexed buyer,
        address indexed publisher,
        uint256 indexed apiId,
        uint256 amount,
        uint256 nonce
    );

    // ============ Constants ============

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant CALL_TYPEHASH =
        keccak256("Call(address buyer,uint256 apiId,uint256 amount,uint256 nonce)");

    uint256 private constant SECP256K1N_DIV_2 =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    // ============ Storage ============

    ARTICL public immutable token;
    uint256 public nextApiId = 1;
    mapping(uint256 => ApiOffering) public apis;
    mapping(address => mapping(uint256 => bool)) public usedNonces;
    bytes32 public immutable DOMAIN_SEPARATOR;

    // ============ Constructor ============

    constructor(ARTICL _token) {
        token = _token;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("ARTICLMarketplace")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // ============ API Management ============

    function registerApi(
        string calldata name,
        string calldata metadataURI,
        uint256 recommendedPrice
    ) external returns (uint256 apiId) {
        apiId = nextApiId++;
        apis[apiId] = ApiOffering({
            publisher: msg.sender,
            name: name,
            metadataURI: metadataURI,
            recommendedPrice: recommendedPrice,
            exists: true
        });

        emit ApiRegistered(apiId, msg.sender, name, metadataURI, recommendedPrice);
    }

    function updateApi(
        uint256 apiId,
        string calldata metadataURI,
        uint256 recommendedPrice
    ) external {
        ApiOffering storage api = apis[apiId];
        if (!api.exists) revert ApiDoesNotExist();
        if (api.publisher != msg.sender) revert NotPublisher();

        api.metadataURI = metadataURI;
        api.recommendedPrice = recommendedPrice;

        emit ApiUpdated(apiId, metadataURI, recommendedPrice);
    }

    // ============ Redemption ============

    function redeemCall(SignedCall calldata callData) external {
        ApiOffering memory api = _getApi(callData.apiId);
        _verify(callData, api.publisher);
        usedNonces[callData.buyer][callData.nonce] = true;

        bool success = token.transferFrom(callData.buyer, api.publisher, callData.amount);
        if (!success) revert TransferFailed();

        emit CallRedeemed(callData.buyer, api.publisher, callData.apiId, callData.amount, callData.nonce);
    }

    /**
     * @notice Redeem a batch of signed calls atomically. Aggregates transferFrom per buyer.
     */
    function redeemCalls(SignedCall[] calldata calls) external {
        uint256 length = calls.length;
        if (length == 0) return;

        _PreparedCall[] memory prepared = new _PreparedCall[](length);
        bytes32[] memory seenNonces = new bytes32[](length);
        uint256 seenNonceCount;
        address[] memory uniqueBuyers = new address[](length);
        uint256[] memory buyerTotals = new uint256[](length);
        uint256 buyerCount;

        address[] memory uniquePublishers = new address[](length);
        uint256[] memory publisherTotals = new uint256[](length);
        uint256 publisherCount;

        // 1) Verify signatures & build aggregates
        for (uint256 i = 0; i < length; i++) {
            SignedCall calldata c = calls[i];
            ApiOffering memory api = _getApi(c.apiId);
            bytes32 nonceKey = keccak256(abi.encodePacked(c.buyer, c.nonce));

            if (_indexOfBytes32(seenNonces, seenNonceCount, nonceKey) != type(uint256).max) {
                revert NonceAlreadyUsed();
            }
            seenNonces[seenNonceCount] = nonceKey;
            unchecked {
                seenNonceCount++;
            }

            _verify(c, api.publisher);

            prepared[i] = _PreparedCall({
                buyer: c.buyer,
                publisher: api.publisher,
                apiId: c.apiId,
                amount: c.amount,
                nonce: c.nonce
            });

            // aggregate per buyer for a single transferFrom
            uint256 buyerIndex = _indexOf(uniqueBuyers, buyerCount, c.buyer);
            if (buyerIndex == type(uint256).max) {
                uniqueBuyers[buyerCount] = c.buyer;
                buyerTotals[buyerCount] = c.amount;
                unchecked {
                    buyerCount++;
                }
            } else {
                buyerTotals[buyerIndex] += c.amount;
            }

            // aggregate payouts per publisher (cheaper transfers than multiple transferFrom)
            uint256 pubIndex = _indexOf(uniquePublishers, publisherCount, api.publisher);
            if (pubIndex == type(uint256).max) {
                uniquePublishers[publisherCount] = api.publisher;
                publisherTotals[publisherCount] = c.amount;
                unchecked {
                    publisherCount++;
                }
            } else {
                publisherTotals[pubIndex] += c.amount;
            }
        }

        // 2) Pull funds once per buyer
        for (uint256 i = 0; i < buyerCount; i++) {
            bool success = token.transferFrom(uniqueBuyers[i], address(this), buyerTotals[i]);
            if (!success) revert TransferFailed();
        }

        // 3) Pay publishers
        for (uint256 i = 0; i < publisherCount; i++) {
            bool success = token.transfer(uniquePublishers[i], publisherTotals[i]);
            if (!success) revert TransferFailed();
        }

        // 4) Mark nonces & emit
        for (uint256 i = 0; i < length; i++) {
            _PreparedCall memory p = prepared[i];
            usedNonces[p.buyer][p.nonce] = true;
            emit CallRedeemed(p.buyer, p.publisher, p.apiId, p.amount, p.nonce);
        }
    }

    // ============ Signature Helpers ============

    function hashCall(
        address buyer,
        uint256 apiId,
        uint256 amount,
        uint256 nonce
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(CALL_TYPEHASH, buyer, apiId, amount, nonce));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function _verify(SignedCall calldata callData, address publisher) internal view {
        if (callData.amount == 0) revert AmountZero();
        if (usedNonces[callData.buyer][callData.nonce]) revert NonceAlreadyUsed();
        if (publisher == address(0)) revert ApiDoesNotExist();

        bytes32 digest = hashCall(callData.buyer, callData.apiId, callData.amount, callData.nonce);
        address signer = _recover(digest, callData.signature);
        if (signer != callData.buyer) revert InvalidSignature();
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }

        if (uint256(s) > SECP256K1N_DIV_2) revert InvalidSignature();
        if (v != 27 && v != 28) revert InvalidSignature();

        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }

    // ============ Helpers ============

    function _getApi(uint256 apiId) internal view returns (ApiOffering memory api) {
        api = apis[apiId];
        if (!api.exists) revert ApiDoesNotExist();
    }

    function _indexOf(address[] memory list, uint256 count, address needle) private pure returns (uint256) {
        for (uint256 i = 0; i < count; i++) {
            if (list[i] == needle) return i;
        }
        return type(uint256).max;
    }

    function _indexOfBytes32(bytes32[] memory list, uint256 count, bytes32 needle) private pure returns (uint256) {
        for (uint256 i = 0; i < count; i++) {
            if (list[i] == needle) return i;
        }
        return type(uint256).max;
    }
}
