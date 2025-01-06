// test/TokenLaunch.test.ts
import {expect} from "chai";
import {
  parseEther,
  getAddress,
  Address,
  PublicClient,
  WalletClient,
  Hash, formatEther
} from "viem";
import {time, loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import hre from "hardhat";
import {deployContract} from "./helpers/deploy";
import {bigintAssertions,} from "./helpers/assertions";

describe("TokenLaunch", () => {
  let accounts: Address[];
  let publicClient: PublicClient;

  before(async () => {
    const walletClients = await hre.viem.getWalletClients();
    accounts = walletClients.map(client => client.account.address);
    publicClient = await hre.viem.getPublicClient();
  });

  async function deployFixture() {
    const [deployer, aiAgent, user1, user2, user3] = accounts;

    // Deploy MockERC20 with sufficient supply
    const mockToken = await deployContract({
      name: "MockERC20",
      args: ["Mock", "MCK", parseEther("1000000")],
      deployer
    });

    const currentTime = await time.latest();
    const launchTime = BigInt(currentTime) + 3600n;
    const launchPercentage = 10n; // 10% of total supply

    // Deploy TokenLaunch
    const tokenLaunch = await deployContract({
      name: "TokenLaunch",
      args: [mockToken.address, launchPercentage, launchTime, aiAgent],
      deployer
    });

    // Transfer tokens to aiAgent and approve
    const deployerWallet = await hre.viem.getWalletClient(deployer);
    await deployerWallet.writeContract({
      address: mockToken.address,
      abi: mockToken.abi,
      functionName: "transfer",
      args: [aiAgent, parseEther("100000")]
    });

    const aiAgentWallet = await hre.viem.getWalletClient(aiAgent);
    await aiAgentWallet.writeContract({
      address: mockToken.address,
      abi: mockToken.abi,
      functionName: "approve",
      args: [tokenLaunch.address, parseEther("100000")]
    });

    return {
      tokenLaunch,
      mockToken,
      deployer,
      aiAgent,
      user1,
      user2,
      user3,
      launchTime
    };
  }

  describe("Deployment", () => {
    it("Should deploy with correct initial values", async () => {
      const {tokenLaunch, mockToken, aiAgent} = await loadFixture(deployFixture);

      const launchTokenAddress = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "launchToken",
        args: [],
      }) as Address;

      const aiAgentAddress = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "aiAgentWallet",
        args: [],
      }) as Address;


      expect(getAddress(launchTokenAddress)).to.equal(getAddress(mockToken.address));
      expect(getAddress(aiAgentAddress)).to.equal(getAddress(aiAgent));
    });

    it("Should revert with invalid parameters", async () => {
      const [deployer, aiAgent] = accounts;
      const futureTime = BigInt(await time.latest()) + 3600n;

      await expect(
              deployContract({
                name: "TokenLaunch",
                args: [
                  "0x0000000000000000000000000000000000000000",
                  10n,
                  futureTime,
                  aiAgent
                ],
                deployer
              })
      ).to.be.rejectedWith("Invalid token address");
    });
  });

  describe("Participation Phase", () => {
    it("Should allow users to participate", async () => {
      const {tokenLaunch, user1, user2} = await loadFixture(deployFixture);

      // User1 participates
      const user1Wallet = await hre.viem.getWalletClient(user1);
      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("1"),
        args: []
      });

      // User2 participates
      const user2Wallet = await hre.viem.getWalletClient(user2);
      await user2Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("2"),
        args: [],
      });

      const user1Contribution = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "userContributions",
        args: [user1]
      }) as bigint;

      const totalReceived = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "totalEthReceived",
        args: [],
      }) as bigint;

      expect(user1Contribution).to.equal(parseEther("1"));
      expect(totalReceived).to.equal(parseEther("3"));
    });

    it("Should revert participation after launch time", async () => {
      const {tokenLaunch, user1, launchTime} = await loadFixture(deployFixture);

      await time.increaseTo(Number(launchTime) + 1);

      const user1Wallet = await hre.viem.getWalletClient(user1);
      await expect(
              user1Wallet.writeContract({
                address: tokenLaunch.address,
                abi: tokenLaunch.abi,
                functionName: "participateInLaunch",
                value: parseEther("1"),
                args: [],
              })
      ).to.be.rejectedWith("Launch time has passed");
    });

    it("Should track multiple contributions from same user", async () => {
      const {tokenLaunch, user1} = await loadFixture(deployFixture);
      const user1Wallet = await hre.viem.getWalletClient(user1);

      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("1"),
        args: [],
      });

      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("2"),
        args: [],
      });

      const totalContribution = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "userContributions",
        args: [user1]
      }) as bigint;

      expect(totalContribution).to.equal(parseEther("3"));
    });
  });

  describe("Distribution Phase", () => {
    it("Should start distribution correctly", async () => {
      const {tokenLaunch, user1, launchTime} = await loadFixture(deployFixture);

      const user1Wallet = await hre.viem.getWalletClient(user1);
      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("1"),
        args: [],
      });

      await time.increaseTo(Number(launchTime) + 1);

      const tx = await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "startDistribution",
        args: [],
      }) as Hash;

      const receipt = await publicClient.waitForTransactionReceipt({hash: tx});

      const isStarted = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "distributionStarted",
        args: [],
      }) as boolean;

      expect(isStarted).to.be.true;
    });

    it("Should distribute tokens correctly", async () => {
      const { tokenLaunch, mockToken, deployer, aiAgent, user1, user2, launchTime } = await loadFixture(deployFixture);

      // 首先转移代币给 aiAgent
      const deployerWallet = await hre.viem.getWalletClient(deployer);
      await deployerWallet.writeContract({
        address: mockToken.address,
        abi: mockToken.abi,
        functionName: "transfer",
        args: [aiAgent, parseEther("100000")]
      });

      // aiAgent 授权给 tokenLaunch 合约
      const aiAgentWallet = await hre.viem.getWalletClient(aiAgent);
      await aiAgentWallet.writeContract({
        address: mockToken.address,
        abi: mockToken.abi,
        functionName: "approve",
        args: [tokenLaunch.address, parseEther("100000")]
      });

      // Setup participants
      const user1Wallet = await hre.viem.getWalletClient(user1);
      const user2Wallet = await hre.viem.getWalletClient(user2);

      // User1 参与
      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("1"),
        args: [],
      });

      // User2 参与
      await user2Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("1"),
        args: [],
      });

      // 检查总接收的 ETH
      const totalReceived = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "totalEthReceived",
        args: [],
      }) as bigint;
      bigintAssertions.expectEqual(totalReceived, parseEther("2"), "Total ETH received should be 2 ETH");

      // 启动分发
      await time.increaseTo(Number(launchTime) + 1);
      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "startDistribution",
        args: [],
      });

      // 检查分发是否已启动
      const isStarted = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "distributionStarted",
        args: [],
      }) as boolean;
      expect(isStarted).to.be.true;

      // 执行分发
      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "distributeTokensBatch",
        args: [],
      });

      // 检查分发进度
      const [completed, total] = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "getDistributionProgress",
        args: [],
      }) as [bigint, bigint];
      bigintAssertions.expectEqual(completed, total, "Distribution should be completed");

      // 检查代币余额
      const user1Balance = await publicClient.readContract({
        address: mockToken.address,
        abi: mockToken.abi,
        functionName: "balanceOf",
        args: [user1]
      }) as bigint;

      const user2Balance = await publicClient.readContract({
        address: mockToken.address,
        abi: mockToken.abi,
        functionName: "balanceOf",
        args: [user2]
      }) as bigint;

      // 检查 aiAgent 的代币余额
      const aiAgentBalance = await publicClient.readContract({
        address: mockToken.address,
        abi: mockToken.abi,
        functionName: "balanceOf",
        args: [aiAgent]
      }) as bigint;

      // 验证结果
      bigintAssertions.expectGreaterThan(user1Balance, 0n, "User1 should have tokens");
      bigintAssertions.expectEqual(user1Balance, user2Balance, "Users should have equal tokens");

      // 打印详细信息以便调试
      console.log({
        user1Balance: user1Balance.toString(),
        user2Balance: user2Balance.toString(),
        aiAgentBalance: aiAgentBalance.toString(),
        totalReceived: totalReceived.toString(),
        completed: completed.toString(),
        total: total.toString()
      });
    });

    it("Should handle batch distribution correctly", async () => {
      const {tokenLaunch, user1, launchTime} = await loadFixture(deployFixture);
      const walletClients = await hre.viem.getWalletClients();

      // Add many participants (more than BATCH_SIZE)
      for (let i = 0; i < 150 && i < walletClients.length; i++) {
        const wallet = await hre.viem.getWalletClient(walletClients[i].account.address);
        await wallet.writeContract({
          address: tokenLaunch.address,
          abi: tokenLaunch.abi,
          functionName: "participateInLaunch",
          value: parseEther("0.1"),
          args: [],
        });
      }

      await time.increaseTo(Number(launchTime) + 1);

      const user1Wallet = await hre.viem.getWalletClient(user1);
      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "startDistribution",
        args: [],
      });

      // Process all batches
      let completed = 0n;
      let total = 150n;

      while (completed < total) {
        await user1Wallet.writeContract({
          address: tokenLaunch.address,
          abi: tokenLaunch.abi,
          functionName: "distributeTokensBatch",
          args: [],
        });

        [completed, total] = await publicClient.readContract({
          address: tokenLaunch.address,
          abi: tokenLaunch.abi,
          functionName: "getDistributionProgress",
          args: [],
        }) as [bigint, bigint];
      }

      expect(completed).to.equal(total);
    });
  });

  describe("View Functions", () => {
    it("Should return correct estimated tokens", async () => {
      const {tokenLaunch, user1} = await loadFixture(deployFixture);
      const user1Wallet = await hre.viem.getWalletClient(user1);

      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("1"),
        args: [],
      });

      const estimatedTokens = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "getEstimatedTokens",
        args: [user1]
      }) as bigint;

      bigintAssertions.expectGreaterThan(estimatedTokens, 0n)
    });

    it("Should return correct user list", async () => {
      const { tokenLaunch, user1, user2 } = await loadFixture(deployFixture);

      // 获取初始用户列表
      const initialUserList = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "getUserList",
        args: [],
      }) as Address[];

      expect(initialUserList.length).to.equal(0, "Initial user list should be empty");

      // User1 参与
      const user1Wallet = await hre.viem.getWalletClient(user1);
      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("1"),
        args: [],
      });

      // 检查用户1添加后的列表
      const afterUser1List = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "getUserList",
        args: [],
      }) as Address[];

      expect(afterUser1List.length).to.equal(1, "List should have one user");
      expect(getAddress(afterUser1List[0])).to.equal(getAddress(user1), "First user should be user1");

      // User2 参与
      const user2Wallet = await hre.viem.getWalletClient(user2);
      await user2Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("1"),
        args: [],
      });

      // 获取最终用户列表
      const finalUserList = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "getUserList",
        args: [],
      }) as Address[];

      // 验证最终列表
      expect(finalUserList.length).to.equal(2, "Final list should have two users");
      expect(finalUserList.map(addr => getAddress(addr))).to.include(getAddress(user1), "List should include user1");
      expect(finalUserList.map(addr => getAddress(addr))).to.include(getAddress(user2), "List should include user2");

      // 打印调试信息
      console.log({
        user1: getAddress(user1),
        user2: getAddress(user2),
        finalUserList: finalUserList.map(addr => getAddress(addr))
      });

      // 验证用户贡献
      const user1Contribution = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "userContributions",
        args: [user1]
      }) as bigint;

      const user2Contribution = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "userContributions",
        args: [user2]
      }) as bigint;

      bigintAssertions.expectEqual(user1Contribution, parseEther("1"), "User1 contribution should be 1 ETH");
      bigintAssertions.expectEqual(user2Contribution, parseEther("1"), "User2 contribution should be 1 ETH");
    });

    // 添加重复参与的测试
    it("Should handle multiple participations from same user", async () => {
      const { tokenLaunch, user1 } = await loadFixture(deployFixture);

      const user1Wallet = await hre.viem.getWalletClient(user1);

      // 用户多次参与
      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("1"),
        args: [],
      });

      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("1"),
        args: [],
      });

      // 检查用户列表长度
      const userList = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "getUserList",
        args: [],
      }) as Address[];

      expect(userList.length).to.equal(1, "User list should have only one entry for multiple participations");
      expect(getAddress(userList[0])).to.equal(getAddress(user1), "User should be user1");

      // 检查总贡献
      const totalContribution = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "userContributions",
        args: [user1]
      }) as bigint;

      bigintAssertions.expectEqual(totalContribution, parseEther("2"), "Total contribution should be 2 ETH");
    });
  });

  describe("Edge Cases", () => {
    it("Should handle zero contributions correctly", async () => {
      const {tokenLaunch, user1} = await loadFixture(deployFixture);
      const user1Wallet = await hre.viem.getWalletClient(user1);

      await expect(
              user1Wallet.writeContract({
                address: tokenLaunch.address,
                abi: tokenLaunch.abi,
                functionName: "participateInLaunch",
                value: 0n,
                args: [],
              })
      ).to.be.rejectedWith("Must send ETH");
    });

    it("Should prevent distribution before launch time", async () => {
      const {tokenLaunch, user1} = await loadFixture(deployFixture);
      const user1Wallet = await hre.viem.getWalletClient(user1);

      await expect(
              user1Wallet.writeContract({
                address: tokenLaunch.address,
                abi: tokenLaunch.abi,
                functionName: "startDistribution",
                args: [],
              })
      ).to.be.rejectedWith("Launch time not reached");
    });

    it("Should prevent multiple distribution starts", async () => {
      const {tokenLaunch, user1, launchTime} = await loadFixture(deployFixture);
      const user1Wallet = await hre.viem.getWalletClient(user1);

      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "participateInLaunch",
        value: parseEther("1"),
        args: [],
      });

      await time.increaseTo(Number(launchTime) + 1);

      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "startDistribution",
        args: [],
      });

      await expect(
              user1Wallet.writeContract({
                address: tokenLaunch.address,
                abi: tokenLaunch.abi,
                functionName: "startDistribution",
                args: [],
              })
      ).to.be.rejectedWith("Distribution already started");
    });

    it("Should handle receive function correctly", async () => {
      const { tokenLaunch, user1 } = await loadFixture(deployFixture);
      const user1Wallet = await hre.viem.getWalletClient(user1);

      // 获取初始状态
      const initialContribution = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "userContributions",
        args: [user1]
      }) as bigint;

      console.log("Initial contribution:", initialContribution.toString());

      // 直接发送 ETH 到合约
      const tx = await user1Wallet.sendTransaction({
        to: tokenLaunch.address,
        value: parseEther("1"),
        chain: publicClient.chain
      });

      // 等待交易确认并获取收据
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: tx,
        confirmations: 1 // 确保等待至少一个确认
      });

      console.log("Transaction status:", receipt.status);

      // 等待一小段时间确保状态更新
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 检查用户贡献
      const finalContribution = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "userContributions",
        args: [user1]
      }) as bigint;

      console.log("Final contribution:", finalContribution.toString());

      // 检查合约 ETH 余额
      const contractBalance = await publicClient.getBalance({
        address: tokenLaunch.address
      });

      console.log("Contract balance:", contractBalance.toString());

      // 获取用户列表
      const userList = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "getUserList",
        args: [],
      }) as Address[];

      console.log("User list:", userList.map(addr => getAddress(addr)));

      // 检查总接收的 ETH
      const totalReceived = await publicClient.readContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "totalEthReceived",
        args: [],
      }) as bigint;

      console.log("Total received:", totalReceived.toString());

      // 验证结果
      expect(finalContribution).to.equal(parseEther("1"), "Contribution should be 1 ETH");
      expect(contractBalance).to.equal(parseEther("1"), "Contract balance should be 1 ETH");
      expect(totalReceived).to.equal(parseEther("1"), "Total received should be 1 ETH");

      expect(userList.length).to.equal(1, "User list should have one entry");
      expect(getAddress(userList[0])).to.equal(getAddress(user1), "User should be in the list");

      // 验证事件是否被触发
      const logs = await publicClient.getLogs({
        address: tokenLaunch.address,
        event: {
          type: 'event',
          name: 'Participated',
          inputs: [
            { type: 'address', name: 'user', indexed: true },
            { type: 'uint256', name: 'amount' }
          ]
        },
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber
      });

      expect(logs.length).to.equal(1, "Participated event should be emitted");
      expect(getAddress(logs[0].args.user as Address)).to.equal(getAddress(user1));
      expect(logs[0].args.amount as bigint).to.equal(parseEther("1"));
    });

    // 添加一个测试用例验证在启动时间后的接收函数
    it("Should reject receive function after launch time", async () => {
      const { tokenLaunch, user1, launchTime } = await loadFixture(deployFixture);
      const user1Wallet = await hre.viem.getWalletClient(user1);

      // 增加时间到启动时间之后
      await time.increaseTo(Number(launchTime) + 1);

      // 尝试直接发送 ETH，应该被拒绝
      await expect(
              user1Wallet.sendTransaction({
                to: tokenLaunch.address,
                value: parseEther("1"),
                chain: publicClient.chain
              })
      ).to.be.rejectedWith("Launch time has passed");
    });

    // 添加一个测试用例验证零值转账
    it("Should reject zero value transfers", async () => {
      const { tokenLaunch, user1 } = await loadFixture(deployFixture);
      const user1Wallet = await hre.viem.getWalletClient(user1);

      // 尝试发送 0 ETH
      await expect(
              user1Wallet.sendTransaction({
                to: tokenLaunch.address,
                value: 0n,
                chain: publicClient.chain
              })
      ).to.be.rejectedWith("Must send ETH");
    });
  });

  describe("Gas Usage", () => {
    it("Should optimize gas for batch distribution", async () => {
      const {tokenLaunch, user1, launchTime} = await loadFixture(deployFixture);
      const user1Wallet = await hre.viem.getWalletClient(user1);

      // Add 10 participants
      for (let i = 0; i < 10; i++) {
        await user1Wallet.writeContract({
          address: tokenLaunch.address,
          abi: tokenLaunch.abi,
          functionName: "participateInLaunch",
          value: parseEther("0.1"),
          args: [],
        });
      }

      await time.increaseTo(Number(launchTime) + 1);

      await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "startDistribution",
        args: [],
      });

      const tx = await user1Wallet.writeContract({
        address: tokenLaunch.address,
        abi: tokenLaunch.abi,
        functionName: "distributeTokensBatch",
        args: [],
      }) as Hash;

      const receipt = await publicClient.waitForTransactionReceipt({hash: tx});
      bigintAssertions.expectLessThan(receipt.gasUsed, 8000000n)
    });
  });
});

