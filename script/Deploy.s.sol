// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ARTICL} from "../src/ARTICL.sol";
import {ARTICLMarketplace} from "../src/ARTICLMarketplace.sol";

/**
 * @title Deploy Script for ARTICL Protocol
 * @notice Deploys both ARTICL token and ARTICLMarketplace contracts.
 *
 * Usage:
 *   forge script script/Deploy.s.sol:DeployScript --rpc-url <RPC_URL> --broadcast
 *
 * Local deployment (Anvil):
 *   forge script script/Deploy.s.sol:DeployScript --rpc-url http://localhost:8545 --broadcast
 *
 * Base Sepolia:
 *   forge script script/Deploy.s.sol:DeployScript --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
 */
contract DeployScript is Script {
    function run() external returns (ARTICL, ARTICLMarketplace) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy ARTICL token
        ARTICL articl = new ARTICL();

        // 2. Deploy ARTICLMarketplace with token address
        ARTICLMarketplace marketplace = new ARTICLMarketplace(articl);

        console.log("========================================");
        console.log("ARTICL Protocol Deployed!");
        console.log("========================================");
        console.log("ARTICL Token:       ", address(articl));
        console.log("ARTICLMarketplace:  ", address(marketplace));
        console.log("Deployer:           ", vm.addr(deployerPrivateKey));
        console.log("========================================");

        vm.stopBroadcast();

        return (articl, marketplace);
    }
}
