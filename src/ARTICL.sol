// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ARTICL ERC20 wrapper token
 * @notice 1 ETH mints 100,000,000 ARTICL (conversion factor 10^8)
 * @dev Token is fully backed by ETH held in this contract. Decimals are 0 so
 *      balances map 1:1 to redeemable units of 1e-8 ETH.
 */
contract ARTICL {
    // ============ Constants ============

    string public constant name = "ARTICL";
    string public constant symbol = "ARTICL";
    uint8 public constant decimals = 0;
    uint256 public constant CONVERSION_FACTOR = 1e8; // ARTICL per 1 ETH

    // ============ Errors ============

    error ZeroAddress();
    error ZeroAmount();
    error MintWouldCreateZeroTokens();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InsufficientBacking();
    error RedeemTransferFailed();
    error MintRefundFailed();

    // ============ ERC20 Events ============

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ============ Custom Events ============

    event Minted(address indexed minter, uint256 ethIn, uint256 tokenOut);
    event Redeemed(address indexed redeemer, address indexed to, uint256 burned, uint256 ethOut);

    // ============ Storage ============

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ============ Mint/Redeem ============

    /**
     * @notice Mint ARTICL by sending ETH.
     * @param to Recipient of minted tokens.
     * @return minted Amount of ARTICL minted.
     */
    function mint(address to) external payable returns (uint256 minted) {
        if (to == address(0)) revert ZeroAddress();

        minted = (msg.value * CONVERSION_FACTOR) / 1 ether;
        if (minted == 0) revert MintWouldCreateZeroTokens();

        uint256 ethRequired = (minted * 1 ether) / CONVERSION_FACTOR;
        uint256 refund = msg.value - ethRequired;

        totalSupply += minted;
        balanceOf[to] += minted;

        emit Transfer(address(0), to, minted);
        emit Minted(msg.sender, ethRequired, minted);

        if (refund != 0) {
            (bool refundSuccess, ) = msg.sender.call{value: refund}("");
            if (!refundSuccess) revert MintRefundFailed();
        }
    }

    /**
     * @notice Redeem ARTICL back to ETH.
     * @param amount Amount of ARTICL to burn.
     * @param to Recipient of redeemed ETH.
     * @return ethAmount Amount of ETH sent out.
     */
    function redeem(uint256 amount, address payable to) external returns (uint256 ethAmount) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();

        ethAmount = (amount * 1 ether) / CONVERSION_FACTOR;
        if (address(this).balance < ethAmount) revert InsufficientBacking();

        unchecked {
            balanceOf[msg.sender] -= amount;
            totalSupply -= amount;
        }

        emit Transfer(msg.sender, address(0), amount);
        emit Redeemed(msg.sender, to, amount, ethAmount);

        (bool success, ) = to.call{value: ethAmount}("");
        if (!success) revert RedeemTransferFailed();
    }

    // ============ ERC20 ============

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance < value) revert InsufficientAllowance();

        if (currentAllowance != type(uint256).max) {
            unchecked {
                allowance[from][msg.sender] = currentAllowance - value;
            }
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }

        _transfer(from, to, value);
        return true;
    }

    // ============ Internal ============

    function _transfer(address from, address to, uint256 value) internal {
        if (balanceOf[from] < value) revert InsufficientBalance();

        if (to == address(0)) {
            unchecked {
                balanceOf[from] -= value;
                totalSupply -= value;
            }
            emit Transfer(from, address(0), value);
            return;
        }

        if (value == 0) {
            emit Transfer(from, to, 0);
            return;
        }

        unchecked {
            balanceOf[from] -= value;
            balanceOf[to] += value;
        }

        emit Transfer(from, to, value);
    }

    receive() external payable {
        revert("Use mint");
    }
}
