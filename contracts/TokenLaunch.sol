// contracts/TokenLaunch.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TokenLaunch is Ownable(msg.sender), ReentrancyGuard {
    IERC20 public launchToken;
    uint256 public launchAmount;
    uint256 public launchTime;
    address public aiAgentWallet;

    uint256 public totalEthReceived;
    bool public isFinalized;
    uint256 public currentDistributionIndex;
    bool public distributionStarted;

    mapping(address => uint256) public userContributions;
    address[] private users;
    mapping(address => bool) private isUserAdded;
    mapping(address => bool) public hasReceivedTokens;

    event Participated(address indexed user, uint256 amount);
    event TokensDistributed(address indexed user, uint256 amount);
    event LaunchFinalized(uint256 totalEth, uint256 totalTokens);
    event DistributionStarted();

    uint256 public constant BATCH_SIZE = 100;

    constructor(
        address _token,
        uint256 _launchPercentage,
        uint256 _launchTime,
        address _aiAgentWallet
    ) {
        require(_token != address(0), "Invalid token address");
        require(_launchPercentage > 0 && _launchPercentage <= 100, "Invalid launch percentage");
        require(_launchTime > block.timestamp, "Launch time must be in future");
        require(_aiAgentWallet != address(0), "Invalid AI agent wallet address");

        launchToken = IERC20(_token);
        launchAmount = (launchToken.totalSupply() * _launchPercentage) / 100;
        launchTime = _launchTime;
        aiAgentWallet = _aiAgentWallet;
    }

    function participateInLaunch() public payable nonReentrant {
        require(msg.value > 0, "Must send ETH");
        require(block.timestamp < launchTime, "Launch time has passed");
        require(!isFinalized, "Launch is already finalized");

        if (!isUserAdded[msg.sender]) {
            users.push(msg.sender);
            isUserAdded[msg.sender] = true;
        }

        userContributions[msg.sender] += msg.value;
        totalEthReceived += msg.value;

        emit Participated(msg.sender, msg.value);
    }


    function startDistribution() external nonReentrant {
        require(block.timestamp >= launchTime, "Launch time not reached");
        require(!distributionStarted, "Distribution already started");
        require(
            launchToken.allowance(aiAgentWallet, address(this)) >= launchAmount,
            "Insufficient allowance"
        );

        isFinalized = true;
        distributionStarted = true;
        currentDistributionIndex = 0;

        emit DistributionStarted();

        (bool success,) = aiAgentWallet.call{value: address(this).balance}("");
        require(success, "ETH transfer failed");
    }

    function distributeTokensBatch() external nonReentrant {
        require(distributionStarted, "Distribution not started");
        require(currentDistributionIndex < users.length, "Distribution completed");

        uint256 endIndex = currentDistributionIndex + BATCH_SIZE;
        if (endIndex > users.length) {
            endIndex = users.length;
        }

        uint256 distributedAmount = 0;

        for (uint256 i = currentDistributionIndex; i < endIndex; i++) {
            address user = users[i];
            if (userContributions[user] > 0 && !hasReceivedTokens[user]) {
                uint256 tokenAmount = (launchAmount * userContributions[user]) / totalEthReceived;
                require(
                    launchToken.transferFrom(aiAgentWallet, user, tokenAmount),
                    "Token transfer failed"
                );
                hasReceivedTokens[user] = true;
                distributedAmount += tokenAmount;
                emit TokensDistributed(user, tokenAmount);
            }
        }

        currentDistributionIndex = endIndex;

        if (currentDistributionIndex == users.length) {
            emit LaunchFinalized(totalEthReceived, launchAmount);
        }
    }

    function getDistributionProgress() external view returns (uint256 completed, uint256 total) {
        return (currentDistributionIndex, users.length);
    }

    function getUserList() public view returns (address[] memory) {
        return users;
    }

    function getEstimatedTokens(address user) external view returns (uint256) {
        if (totalEthReceived == 0 || userContributions[user] == 0) return 0;
        return (launchAmount * userContributions[user]) / totalEthReceived;
    }

    receive() external payable {
        participateInLaunch();
    }
}
