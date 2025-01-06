// contracts/TokenLaunch.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";  // 导入ERC20接口
import "@openzeppelin/contracts/access/Ownable.sol";      // 导入拥有者管理合约
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";  // 导入重入保护合约

// TokenLaunch合约继承自Ownable和ReentrancyGuard
contract TokenLaunch is Ownable(msg.sender), ReentrancyGuard {
    // 宣告各类状态变量
    IERC20 public launchToken;              // 启动代币
    uint256 public launchAmount;            // 启动代币数量
    uint256 public launchTime;              // 启动时间
    address public aiAgentWallet;           // AI代理的钱包地址

    uint256 public totalEthReceived;        // 总共接收到的ETH
    bool public isFinalized;                // 是否完成
    uint256 public currentDistributionIndex; // 当前分发的用户索引
    bool public distributionStarted;        // 分发是否已经开始

    mapping(address => uint256) public userContributions;  // 记录每个用户的ETH贡献
    address[] private users;                         // 所有参与的用户列表
    mapping(address => bool) private isUserAdded;       // 是否已经加入用户
    mapping(address => bool) public hasReceivedTokens;  // 用户是否已收到代币

    // 定义事件
    event Participated(address indexed user, uint256 amount);   // 用户参与事件
    event TokensDistributed(address indexed user, uint256 amount); // 代币分发事件
    event LaunchFinalized(uint256 totalEth, uint256 totalTokens); // 启动完成事件
    event DistributionStarted(); // 分发开始事件

    uint256 public constant BATCH_SIZE = 100;  // 每批次处理的用户数量

    // 合约构造函数
    constructor(
        address _token,                    // 代币地址
        uint256 _launchPercentage,         // 启动代币占比
        uint256 _launchTime,               // 启动时间
        address _aiAgentWallet             // AI代理钱包地址
    ) {
        // 验证输入参数
        require(_token != address(0), "Invalid token address"); // 确保代币地址有效
        require(_launchPercentage > 0 && _launchPercentage <= 100, "Invalid launch percentage"); // 启动百分比必须在0到100之间
        require(_launchTime > block.timestamp, "Launch time must be in future"); // 启动时间必须在当前时间之后
        require(_aiAgentWallet != address(0), "Invalid AI agent wallet address"); // 确保AI代理钱包地址有效

        // 初始化状态变量
        launchToken = IERC20(_token);
        launchAmount = (launchToken.totalSupply() * _launchPercentage) / 100; // 根据比例计算启动代币数量
        launchTime = _launchTime;
        aiAgentWallet = _aiAgentWallet;
    }

    // 参与启动的函数
    function participateInLaunch() public payable nonReentrant {
        require(msg.value > 0, "Must send ETH");   // 确保发送ETH
        require(block.timestamp < launchTime, "Launch time has passed"); // 确保启动时间尚未到来
        require(!isFinalized, "Launch is already finalized"); // 确保合约没有被最终确定

        // 如果用户是第一次参与，加入到用户列表中
        if (!isUserAdded[msg.sender]) {
            users.push(msg.sender);
            isUserAdded[msg.sender] = true;
        }

        // 记录用户的贡献
        userContributions[msg.sender] += msg.value;
        totalEthReceived += msg.value;

        emit Participated(msg.sender, msg.value);  // 触发参与事件
    }

    // 启动分发的函数
    function startDistribution() external nonReentrant {
        require(block.timestamp >= launchTime, "Launch time not reached"); // 确保启动时间已到
        require(!distributionStarted, "Distribution already started"); // 确保分发尚未开始
        require(
            launchToken.allowance(aiAgentWallet, address(this)) >= launchAmount,
            "Insufficient allowance"
        );  // 确保AI代理钱包的授权足够

        // 设置分发的状态
        isFinalized = true;
        distributionStarted = true;
        currentDistributionIndex = 0;

        emit DistributionStarted();  // 触发分发开始事件

        // 将ETH发送到AI代理钱包
        (bool success,) = aiAgentWallet.call{value: address(this).balance}("");
        require(success, "ETH transfer failed");  // 如果ETH转账失败，则回滚
    }

    // 批量分发代币的函数
    function distributeTokensBatch() external nonReentrant {
        require(distributionStarted, "Distribution not started"); // 确保分发已开始
        require(currentDistributionIndex < users.length, "Distribution completed"); // 确保还有用户待分发

        uint256 endIndex = currentDistributionIndex + BATCH_SIZE;
        if (endIndex > users.length) {
            endIndex = users.length; // 处理最后一批用户时避免越界
        }

        uint256 distributedAmount = 0;

        // 分发代币
        for (uint256 i = currentDistributionIndex; i < endIndex; i++) {
            address user = users[i];
            if (userContributions[user] > 0 && !hasReceivedTokens[user]) {
                uint256 tokenAmount = (launchAmount * userContributions[user]) / totalEthReceived;
                require(
                    launchToken.transferFrom(aiAgentWallet, user, tokenAmount),
                    "Token transfer failed"
                ); // 将代币从AI代理钱包转给用户
                hasReceivedTokens[user] = true;  // 标记该用户已收到代币
                distributedAmount += tokenAmount;
                emit TokensDistributed(user, tokenAmount);  // 触发代币分发事件
            }
        }

        currentDistributionIndex = endIndex;  // 更新当前处理的用户索引

        // 如果所有用户都已分发代币，触发完成事件
        if (currentDistributionIndex == users.length) {
            emit LaunchFinalized(totalEthReceived, launchAmount); // 启动完成事件
        }
    }

    // 获取当前分发进度
    function getDistributionProgress() external view returns (uint256 completed, uint256 total) {
        return (currentDistributionIndex, users.length);
    }

    // 获取所有参与者的地址
    function getUserList() public view returns (address[] memory) {
        return users;
    }

    // 计算某个用户预计将收到的代币数量
    function getEstimatedTokens(address user) external view returns (uint256) {
        if (totalEthReceived == 0 || userContributions[user] == 0) return 0;
        return (launchAmount * userContributions[user]) / totalEthReceived;
    }

    // 接收ETH的fallback函数，调用参与函数
    receive() external payable {
        participateInLaunch();
    }
}