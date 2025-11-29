// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ARTICL} from "../src/ARTICL.sol";

/**
 * @title Deploy Script for ARTICL
 * @author jhytabest
 * @notice Deployment script for ARTICL Protocol
 *
 * Usage:
 *   forge script script/Deploy.s.sol:DeployScript --rpc-url <RPC_URL> --broadcast
 *
 * Local deployment (Anvil):
 *   forge script script/Deploy.s.sol:DeployScript --rpc-url http://localhost:8545 --broadcast
 */
contract DeployScript is Script {
    function run() external returns (ARTICL) {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);

        // Deploy the contract
        ARTICL articl = new ARTICL();

        console.log("========================================");
        console.log("ARTICL Contract Deployed!");
        console.log("========================================");
        console.log("Contract Address:", address(articl));
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("========================================");

        // Stop broadcasting
        vm.stopBroadcast();

        return articl;
    }
}
