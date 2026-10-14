const { expect } = require("chai");
const { ethers } = require("hardhat");

function packGasLimits(high, low) {
    return ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(high), 16),
        ethers.zeroPadValue(ethers.toBeHex(low), 16)
    ]);
}

function packPaymasterAndData(paymasterAddress, validationGasLimit, postOpGasLimit, paymasterData = "0x") {
    return ethers.concat([
        paymasterAddress,
        ethers.zeroPadValue(ethers.toBeHex(validationGasLimit), 16),
        ethers.zeroPadValue(ethers.toBeHex(postOpGasLimit), 16),
        paymasterData
    ]);
}

describe("Aethelnet Paymaster ERC-4337", function () {
    let entryPoint, simpleAccountFactory, theForge, paymaster, verifier;
    let owner, bundler, voterWalletSigner;
    let senderAddress;

    before(async function () {
        const signers = await ethers.getSigners();
        owner = signers[0];
        bundler = signers[1];
        voterWalletSigner = ethers.Wallet.createRandom();

        // 1. Deploy EntryPoint
        const EntryPoint = await ethers.getContractFactory("@account-abstraction/contracts/core/EntryPoint.sol:EntryPoint");
        entryPoint = await EntryPoint.deploy();

        // 2. Deploy SimpleAccountFactory
        const SimpleAccountFactory = await ethers.getContractFactory("@account-abstraction/contracts/samples/SimpleAccountFactory.sol:SimpleAccountFactory");
        simpleAccountFactory = await SimpleAccountFactory.deploy(entryPoint.target);

        // 3. Deploy Mock Verifier & TheForge
        const MockVerifier = await ethers.getContractFactory("MockVerifier");
        verifier = await MockVerifier.deploy();
        const TheForge = await ethers.getContractFactory("TheForge");
        theForge = await TheForge.deploy(verifier.target);

        // 4. Deploy Paymaster
        const Paymaster = await ethers.getContractFactory("AethelnetPaymaster");
        paymaster = await Paymaster.deploy(entryPoint.target, theForge.target);

        // Fund Paymaster
        await paymaster.deposit({ value: ethers.parseEther("1.0") });

        // Pre-compute sender address
        const initCode = ethers.concat([
            await simpleAccountFactory.getAddress(),
            simpleAccountFactory.interface.encodeFunctionData("createAccount", [voterWalletSigner.address, 0])
        ]);

        senderAddress = await entryPoint.getSenderAddress(initCode).catch(e => {
            return "0x" + e.data.slice(-40); 
        });
    });

    it("should sponsor registerNode for a 0-ETH wallet", async function () {
        const initCode = ethers.concat([
            await simpleAccountFactory.getAddress(),
            simpleAccountFactory.interface.encodeFunctionData("createAccount", [voterWalletSigner.address, 0])
        ]);

        const registerNodeData = theForge.interface.encodeFunctionData("registerNode", ["127.0.0.1"]);
        
        const SimpleAccount = await ethers.getContractFactory("@account-abstraction/contracts/samples/SimpleAccount.sol:SimpleAccount");
        const executeCalldata = SimpleAccount.interface.encodeFunctionData("execute", [
            theForge.target,
            0n,
            registerNodeData
        ]);

        const userOp = {
            sender: senderAddress,
            nonce: 0n,
            initCode: initCode,
            callData: executeCalldata,
            accountGasLimits: packGasLimits(500000n, 500000n),
            preVerificationGas: 100000n,
            gasFees: packGasLimits(ethers.parseUnits("1", "gwei"), ethers.parseUnits("2", "gwei")),
            paymasterAndData: packPaymasterAndData(paymaster.target, 500000n, 50000n),
            signature: "0x"
        };

        const userOpHash = await entryPoint.getUserOpHash(userOp);
        userOp.signature = await voterWalletSigner.signMessage(ethers.getBytes(userOpHash));

        const tx = await entryPoint.connect(bundler).handleOps([userOp], bundler.address);
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === "UserOperationEvent");
        console.log("Test 1 UserOp Success:", event.args.success);
        if (!event.args.success) {
            const revertEvent = receipt.logs.find(l => l.fragment && l.fragment.name === "UserOperationRevertReason");
            console.log("Revert Reason:", revertEvent ? revertEvent.args.revertReason : "none");
        }

        const activeNodes = await theForge.getActiveNodes();
        expect(activeNodes).to.include("127.0.0.1");
    });

    it("should throttle registerNode spam within 30 minutes", async function () {
        const registerNodeData = theForge.interface.encodeFunctionData("registerNode", ["192.168.1.1"]);
        
        const SimpleAccount = await ethers.getContractFactory("@account-abstraction/contracts/samples/SimpleAccount.sol:SimpleAccount");
        const executeCalldata = SimpleAccount.interface.encodeFunctionData("execute", [
            theForge.target,
            0n,
            registerNodeData
        ]);

        const userOp = {
            sender: senderAddress,
            nonce: 1n,
            initCode: "0x",
            callData: executeCalldata,
            accountGasLimits: packGasLimits(500000n, 500000n),
            preVerificationGas: 100000n,
            gasFees: packGasLimits(ethers.parseUnits("1", "gwei"), ethers.parseUnits("2", "gwei")),
            paymasterAndData: packPaymasterAndData(paymaster.target, 500000n, 50000n),
            signature: "0x"
        };

        let userOpHash = await entryPoint.getUserOpHash(userOp);
        userOp.signature = await voterWalletSigner.signMessage(ethers.getBytes(userOpHash));

        // The first test consumed the heartbeat, this should REVERT at Paymaster
        await expect(
            entryPoint.connect(bundler).handleOps([userOp], bundler.address)
        ).to.be.revertedWithCustomError(entryPoint, "FailedOpWithRevert");

        // Fast forward 30+ minutes
        await ethers.provider.send("evm_increaseTime", [31 * 60]);
        await ethers.provider.send("evm_mine");

        // Now it should succeed
        userOpHash = await entryPoint.getUserOpHash(userOp);
        userOp.signature = await voterWalletSigner.signMessage(ethers.getBytes(userOpHash));

        await entryPoint.connect(bundler).handleOps([userOp], bundler.address);
        
        const activeNodes = await theForge.getActiveNodes();
        expect(activeNodes).to.include("192.168.1.1");
    });

    it("should prevent double ZK voting with the same Nullifier (Replay Attack)", async function () {
        // We need a proposal first
        await theForge.connect(owner).createProposalWithRoot("Test", "Test Proposal", 12345n);
        const proposalId = 0n;
        const nullifierHash = 9999n;

        // Dummy proofs
        const a = [0, 0];
        const b = [[0, 0], [0, 0]];
        const c = [0, 0];

        const voteData = theForge.interface.encodeFunctionData("voteShielded", [
            proposalId, true, a, b, c, nullifierHash
        ]);

        const SimpleAccount = await ethers.getContractFactory("@account-abstraction/contracts/samples/SimpleAccount.sol:SimpleAccount");
        const executeCalldata = SimpleAccount.interface.encodeFunctionData("execute", [
            theForge.target,
            0n,
            voteData
        ]);

        const userOp = {
            sender: senderAddress,
            nonce: 2n,
            initCode: "0x",
            callData: executeCalldata,
            accountGasLimits: packGasLimits(500000n, 500000n),
            preVerificationGas: 100000n,
            gasFees: packGasLimits(ethers.parseUnits("1", "gwei"), ethers.parseUnits("2", "gwei")),
            paymasterAndData: packPaymasterAndData(paymaster.target, 500000n, 50000n),
            signature: "0x"
        };

        // 1st Vote - Should Succeed
        let userOpHash = await entryPoint.getUserOpHash(userOp);
        userOp.signature = await voterWalletSigner.signMessage(ethers.getBytes(userOpHash));
        
        const tx = await entryPoint.connect(bundler).handleOps([userOp], bundler.address);
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === "UserOperationEvent");
        console.log("UserOp Success:", event.args.success);
        if (!event.args.success) {
            const revertEvent = receipt.logs.find(l => l.fragment && l.fragment.name === "UserOperationRevertReason");
            console.log("Revert Reason:", revertEvent ? revertEvent.args.revertReason : "none");
        }
        
        expect(await theForge.hasVotedShielded(proposalId, ethers.toBeHex(nullifierHash, 32))).to.be.true;

        // 2nd Vote with SAME nullifier - Should Revert in Paymaster
        userOp.nonce = 3n;
        userOpHash = await entryPoint.getUserOpHash(userOp);
        userOp.signature = await voterWalletSigner.signMessage(ethers.getBytes(userOpHash));

        await expect(
            entryPoint.connect(bundler).handleOps([userOp], bundler.address)
        ).to.be.revertedWithCustomError(entryPoint, "FailedOpWithRevert"); // Paymaster nullifier check fails!
    });

    it("should revert if trying to execute an unauthorized function (e.g., withdraw ETH)", async function () {
        const SimpleAccount = await ethers.getContractFactory("@account-abstraction/contracts/samples/SimpleAccount.sol:SimpleAccount");
        const executeCalldata = SimpleAccount.interface.encodeFunctionData("execute", [
            owner.address,
            ethers.parseEther("0.1"),
            "0x"
        ]);

        const userOp = {
            sender: senderAddress,
            nonce: 3n,
            initCode: "0x", 
            callData: executeCalldata,
            accountGasLimits: packGasLimits(500000n, 500000n), 
            preVerificationGas: 100000n,
            gasFees: packGasLimits(ethers.parseUnits("1", "gwei"), ethers.parseUnits("2", "gwei")), 
            paymasterAndData: packPaymasterAndData(paymaster.target, 500000n, 50000n),
            signature: "0x"
        };

        const userOpHash = await entryPoint.getUserOpHash(userOp);
        userOp.signature = await voterWalletSigner.signMessage(ethers.getBytes(userOpHash));

        await expect(
            entryPoint.connect(bundler).handleOps([userOp], bundler.address)
        ).to.be.revertedWithCustomError(entryPoint, "FailedOpWithRevert");
    });
});
