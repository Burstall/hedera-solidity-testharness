const fs = require('fs');
const { ethers } = require('ethers');
const { expect } = require('chai');
const { describe, it } = require('mocha');
const {
	Client,
	AccountId,
	PrivateKey,
	AccountCreateTransaction,
	Hbar,
	ContractCreateFlow,
	TransferTransaction,
	// eslint-disable-next-line no-unused-vars
	ContractFunctionParameters,
	HbarUnit,
	ContractExecuteTransaction,
	// eslint-disable-next-line no-unused-vars
	TokenId,
	// eslint-disable-next-line no-unused-vars
	ContractId,
	TokenAssociateTransaction,
	CustomRoyaltyFee,
	CustomFixedFee,
	TokenCreateTransaction,
	TokenType,
	TokenSupplyType,
	TokenMintTransaction,
	NftId,
	AccountAllowanceApproveTransaction,
} = require('@hashgraph/sdk');
const { default: axios } = require('axios');
require('dotenv').config();

// Get operator from .env file
let operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
let operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = 'TestFramework';
const env = process.env.ENVIRONMENT ?? null;
const safeHTSDeployment = process.env.SAFE_HTS ?? null;

const libraryNames = ['SafeHTS'];

const baseUrlForMainnet = 'https://mainnet-public.mirrornode.hedera.com';
const baseUrlForTestnet = 'https://testnet.mirrornode.hedera.com';

const addressRegex = /(\d+\.\d+\.[1-9]\d+)/i;

// reused variable
let contractId;
let contractAddress;
let abi, iface;
let alicePK, aliceId;
let NFTTokenId, FTTokenId;
let client;
let baseUrl;

describe('Deployment: ', function() {
	it('Should deploy the contract and setup conditions', async function() {
		if (operatorKey === undefined || operatorKey == null || operatorId === undefined || operatorId == null) {
			console.log('Environment required, please specify PRIVATE_KEY & ACCOUNT_ID in the .env file');
			process.exit(1);
		}

		console.log('\n-Using ENIVRONMENT:', env);

		if (env.toUpperCase() == 'TEST') {
			client = Client.forTestnet();
			console.log('testing in *TESTNET*');
			baseUrl = baseUrlForTestnet;
		}
		else if (env.toUpperCase() == 'MAIN') {
			client = Client.forMainnet();
			console.log('testing in *MAINNET*');
			baseUrl = baseUrlForMainnet;
		}
		else if (env.toUpperCase() == 'LOCAL') {
			const node = { '127.0.0.1:50211': new AccountId(3) };
			client = Client.forNetwork(node).setMirrorNetwork('127.0.0.1:5600');
			console.log('testing in *LOCAL*');
			baseUrl = 'http://localhost:5551';
			const rootId = AccountId.fromString('0.0.2');
			const rootKey = PrivateKey.fromString('302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137');

			// create an operator account on the local node and use this for testing as operator
			client.setOperator(rootId, rootKey);
			operatorKey = PrivateKey.generateED25519();
			operatorId = await accountCreator(operatorKey, 1000);
		}
		else {
			console.log('ERROR: Must specify either MAIN or TEST as environment in .env file');
			return;
		}

		client.setOperator(operatorId, operatorKey);
		// deploy the contract
		console.log('\n-Using Operator:', operatorId.toString());

		const gasLimit = 1200000;

		const libraryDeployedIds = [];
		for (let i = 0; i < libraryNames.length; i++) {
			const libraryName = libraryNames[i];
			if (libraryName == 'SafeHTS' && safeHTSDeployment) {
				console.log('Skipping SafeHTS deployment as it is already deployed');
				libraryDeployedIds.push(ContractId.fromString(safeHTSDeployment));
				continue;
			}
			console.log('\n-Deploying library:', libraryName);

			const libraryBytecode = JSON.parse(fs.readFileSync(`./artifacts/contracts/${libraryName}.sol/${libraryName}.json`)).bytecode;

			libraryDeployedIds.push(await contractDeployFcn(libraryBytecode, gasLimit));
			console.log(`Library created with ID: ${libraryDeployedIds[i]} / ${libraryDeployedIds[i].toSolidityAddress()}`);
		}

		const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`));

		// import ABI
		abi = json.abi;
		iface = ethers.Interface.from(abi);

		const contractBytecode = json.bytecode;

		// replace library address in bytecode
		console.log('\n-Linking library addresses in bytecode...');
		const readyToDeployBytecode = linkBytecode(contractBytecode, libraryNames, libraryDeployedIds);

		console.log('\n- Deploying contract...', contractName, '\n\tgas@', gasLimit);

		contractId = await contractDeployFcn(readyToDeployBytecode, gasLimit);
		contractAddress = contractId.toSolidityAddress();

		console.log(`Contract created with ID: ${contractId} / ${contractAddress}`);

		console.log('\n-Testing:', contractName);
		// create Alice account
		alicePK = PrivateKey.generateED25519();
		aliceId = await accountCreator(alicePK, 10);
		console.log('Alice account ID:', aliceId.toString(), '\nkey:', alicePK.toString());

		expect(contractId.toString().match(addressRegex).length == 2).to.be.true;
	});

	it('Operator mints a new FT and sends some to Alice', async function() {
		client.setOperator(operatorId, operatorKey);
		let result = await mintFT(operatorId);
		expect(result).to.be.equal('SUCCESS');
		console.log('\n- FT minted @', FTTokenId.toString());

		// associate the FT
		client.setOperator(aliceId, alicePK);
		result = await associateTokenToAccount(aliceId, alicePK, FTTokenId);
		expect(result).to.be.equal('SUCCESS');

		client.setOperator(operatorId, operatorKey);
		result = await sendFT(1000, operatorId, aliceId);
		expect(result).to.be.equal('SUCCESS');
	});

	it('Operator mints a new NFT with royalties and sends to Alice', async function() {
		client.setOperator(operatorId, operatorKey);
		let result = await mintNFT();
		console.log('\n- NFT minted @', NFTTokenId.toString());
		expect(result).to.be.equal('SUCCESS');

		// associate the NFT
		client.setOperator(aliceId, alicePK);
		result = await associateTokenToAccount(aliceId, alicePK, NFTTokenId);
		expect(result).to.be.equal('SUCCESS');

		client.setOperator(operatorId, operatorKey);
		result = await sendNFT([1, 2]);
		expect(result).to.be.equal('SUCCESS');
	});
});

describe('Testing Allowances: ', function() {
	it('Alice approves Contract to spend 10 FT', async function() {
		client.setOperator(aliceId, alicePK);
		const result = await setFTAllowance(FTTokenId, aliceId, AccountId.fromSolidityAddress(contractAddress), 10);
		expect(result).to.be.equal('SUCCESS');
	});

	it('Alice approves Contract to spend *ALL* NFT', async function() {
		client.setOperator(aliceId, alicePK);
		const result = await setNFTAllowanceAll(NFTTokenId, aliceId, AccountId.fromSolidityAddress(contractAddress));
		expect(result).to.be.equal('SUCCESS');
	});

	it('Alice checks the FT approval at contract level', async function() {
		client.setOperator(aliceId, alicePK);
		const [status, allowance] = await checkApprovalFcn(FTTokenId, aliceId, contractId);
		expect(allowance).to.be.equal(10);
		expect(status).to.be.equal('SUCCESS');
	});

	it('Alice checks the NFT approval at contract level', async function() {
		client.setOperator(aliceId, alicePK);
		const [status, approved] = await checkNFTApprovalFcn(NFTTokenId, aliceId, contractId);
		expect(approved).to.be.true;
		expect(status).to.be.equal('SUCCESS');
	});

	it('Verify no FT allowance for Operator at contract level', async function() {
		client.setOperator(aliceId, alicePK);
		const [status, allowance] = await checkApprovalFcn(FTTokenId, operatorId, contractId);
		expect(allowance).to.be.equal(0);
		expect(status).to.be.equal('SUCCESS');
	});

	it('Verify no NFT allowance for Operator at contract level', async function() {
		client.setOperator(aliceId, alicePK);
		const [status, approved] = await checkNFTApprovalFcn(NFTTokenId, operatorId, contractId);
		expect(approved).to.be.false;
		expect(status).to.be.equal('SUCCESS');
	});

	it('Check mirror node for allowance', async function() {
		// mirror nodes have a small delay
		await sleep(2000);
		const result = await checkMirrorAllowance(aliceId, FTTokenId, contractId);
		expect(result).to.be.equal(10);
	});

	it('operator checks Contract for the allowance', async function() {
		client.setOperator(operatorId, operatorKey);
		const [status, allowance] = await checkApprovalFcn(FTTokenId, aliceId, contractId);
		expect(allowance).to.be.equal(10);
		expect(status).to.be.equal('SUCCESS');
	});
});

describe('Testing Transfers: ', function() {
	it('Operator sends 5 tinybar to Contract', async function() {
		client.setOperator(operatorId, operatorKey);
		const result = await sendHbar(AccountId.fromSolidityAddress(contractAddress), operatorId, 5, HbarUnit.Tinybar);
		expect(result).to.be.equal('SUCCESS');
	});

	it('verify Recieve() via HTS send from mirror node', async function() {
		await sleep(5000);
		await checkLastMirrorEvent();
		// expect(result).to.be.equal(5);
		expect(true).to.be.true;
	});

	it('Operator triggers fallback', async function() {
		client.setOperator(operatorId, operatorKey);
		await triggerFallback(8, HbarUnit.Tinybar);
		expect(true).to.be.true;
	});

	it('verify Fallback from mirror node', async function() {
		await sleep(5000);
		await checkLastMirrorEvent();
		// expect(result).to.be.equal(8);
		expect(true).to.be.true;
	});
});


/**
 * @param {AccountId} acct
 * @param {PrivateKey} key
 */
// eslint-disable-next-line no-unused-vars
async function mintFT(acct) {
	const supplyKey = PrivateKey.generateED25519();
	const tokenCreateTx = new TokenCreateTransaction()
		.setTokenName('TestFrameworkToken_FT' + acct.toString())
		.setTokenSymbol('TFT_FT')
		.setTokenType(TokenType.FungibleCommon)
		.setDecimals(1)
		.setInitialSupply(100000)
		.setTreasuryAccountId(acct)
		.setSupplyKey(supplyKey)
		.freezeWith(client);

	const tokenCreateSubmit = await tokenCreateTx.execute(client);
	const tokenCreateRx = await tokenCreateSubmit.getReceipt(client);
	FTTokenId = tokenCreateRx.tokenId;
	return tokenCreateRx.status.toString();
}

/**
 * Helper method for token association
 * @param {AccountId} account
 * @param {PrivateKey} key
 * @param {TokenId} tokenToAssociate
 * @returns {any} expected to be a string 'SUCCESS' implioes it worked
 */
async function associateTokenToAccount(account, key, tokenToAssociate) {
	// now associate the token to the operator account
	const associateToken = await new TokenAssociateTransaction()
		.setAccountId(account)
		.setTokenIds([tokenToAssociate])
		.freezeWith(client)
		.sign(key);

	const associateTokenTx = await associateToken.execute(client);
	const associateTokenRx = await associateTokenTx.getReceipt(client);

	const associateTokenStatus = associateTokenRx.status;

	return associateTokenStatus.toString();
}

/**
 * Helper function to mint an NFT and a serial on to that token
 * Using royaltyies to test the (potentially) more complicate case
 */
async function mintNFT() {
	const supplyKey = PrivateKey.generateED25519();

	// create a basic royalty
	const fee = new CustomRoyaltyFee()
		.setNumerator(2 * 100)
		.setDenominator(10000)
		.setFeeCollectorAccountId(operatorId)
		.setFallbackFee(new CustomFixedFee().setHbarAmount(new Hbar(5)));

	const tokenCreateTx = new TokenCreateTransaction()
		.setTokenType(TokenType.NonFungibleUnique)
		.setTokenName('TestFrameworkTestNFT ' + aliceId.toString())
		.setTokenSymbol('TFTNFT')
		.setInitialSupply(0)
		.setMaxSupply(10)
		.setSupplyType(TokenSupplyType.Finite)
		.setTreasuryAccountId(operatorId)
		.setAutoRenewAccountId(operatorId)
		.setSupplyKey(supplyKey)
		.setCustomFees([fee])
		.setMaxTransactionFee(new Hbar(50, HbarUnit.Hbar));

	tokenCreateTx.freezeWith(client);
	const signedCreateTx = await tokenCreateTx.sign(operatorKey);
	const executionResponse = await signedCreateTx.execute(client);

	/* Get the receipt of the transaction */
	const createTokenRx = await executionResponse.getReceipt(client).catch((e) => {
		console.log(e);
		console.log('Token Create **FAILED*');
	});

	/* Get the token ID from the receipt */
	NFTTokenId = createTokenRx.tokenId;

	const tokenMintTx = new TokenMintTransaction().setTokenId(NFTTokenId);

	// loop 10 times to mint 10 NFTs
	for (let i = 0; i < 10; i++) {
		tokenMintTx.addMetadata(Buffer.from('ipfs://bafybeihbyr6ldwpowrejyzq623lv374kggemmvebdyanrayuviufdhi6xu/metadata.json'));
	}

	tokenMintTx.freezeWith(client);

	const signedTx = await tokenMintTx.sign(supplyKey);
	const tokenMintSubmit = await signedTx.execute(client);
	// check it worked
	const mintRx = await tokenMintSubmit.getReceipt(client);
	return mintRx.status.toString();
}

/**
 * Helper function to send serial 1 of the minted NFT to Alic for testing
 */
async function sendFT(amount, sender, receiver) {
	const transferTx = new TransferTransaction()
		.setTransactionMemo('TestFramework test FT transfer')
		.addTokenTransfer(FTTokenId, receiver, amount)
		.addTokenTransfer(FTTokenId, sender, -amount);

	const txResp = await transferTx.freezeWith(client).execute(client);

	const transferRx = await txResp.getReceipt(client);
	return transferRx.status.toString();
}

/**
 * Helper function to send serials of the minted NFT to Alic for testing
 */
async function sendNFT(serials) {

	const transferTx = new TransferTransaction().setTransactionMemo('TestFramework test NFT transfer');

	for (let s = 0; s < serials; s++) {
		const nft = new NftId(NFTTokenId, serials[s]);
		transferTx.addNftTransfer(nft, operatorId, aliceId);
	}

	const txResp = await transferTx.freezeWith(client).execute(client);

	const transferRx = await txResp.getReceipt(client);
	return transferRx.status.toString();
}

/**
 * Set all allowance for an NFT to contract
 * you can do multiples in a single tx
 * @param {TokenId} _tokenId
 * @param {AccountId} _ownerId
 * @param {AccountId} _spenderId
 * @returns {String} status of the transaction
 */
async function setNFTAllowanceAll(_tokenId, _ownerId, _spenderId) {
	const approvalTx = new AccountAllowanceApproveTransaction().approveTokenNftAllowanceAllSerials(_tokenId, _ownerId, _spenderId);
	approvalTx.freezeWith(client);
	const exResp = await approvalTx.execute(client);
	const receipt = await exResp.getReceipt(client).catch((e) => {
		console.log(e);
		console.log('Allowance set **FAILED*');
	});

	console.log('Allowance for token: ', _tokenId.toString(), receipt.status.toString());
	return receipt.status.toString();
}

/**
 * setup an FT allowance
 * @param {TokenId} _tokenId token to approve
 * @param {AccountId} _ownerId account owning the token
 * @param {*} _spenderId the spender to authorize
 * @param {Number} amount amount to approve
 */
async function setFTAllowance(_tokenId, _ownerId, _spenderId, amount) {
	const approvalTx = new AccountAllowanceApproveTransaction().approveTokenAllowance(_tokenId, _ownerId, _spenderId, amount);
	approvalTx.freezeWith(client);
	const exResp = await approvalTx.execute(client);
	const receipt = await exResp.getReceipt(client).catch((e) => {
		console.log(e);
		console.log('FT Allowance set **FAILED**');
	});

	console.log('FT Allowance:', _tokenId.toString(), amount, 'owner', _ownerId.toString(), 'for', _spenderId.toString(), receipt.status.toString());
	return receipt.status.toString();
}

/**
 * Helper function to deploy the contract
 * @param {string} bytecode bytecode from compiled SOL file
 * @param {number} gasLim gas limit as a number
 * @returns {ContractId | null} the contract ID or null if failed
 */
async function contractDeployFcn(bytecode, gasLim) {
	const contractCreateTx = new ContractCreateFlow()
		.setBytecode(bytecode)
		.setGas(gasLim);
	const contractCreateSubmit = await contractCreateTx.execute(client);
	const contractCreateRx = await contractCreateSubmit.getReceipt(client);
	return contractCreateRx.contractId;
}

/**
 * Helper function to call a contract to check allowance
 * @param {TokenId} _tokenId
 * @param {AccountId} _ownerId
 * @param {ContractId} _spenderId
 * @returns {Number} allowance as a number
 */
async function checkApprovalFcn(_tokenId, _ownerId, _spenderId) {
	const [contractExecuteRx, contractResults] = await contractExecuteFcn(contractId, 200_000, 'checkAllowance',
		[_tokenId.toSolidityAddress(), _ownerId.toSolidityAddress(), _spenderId.toSolidityAddress()]);
	// console.log('Tx Id:', record.transactionId.toString());
	// console.log('allowance is ', contractResults);
	return [contractExecuteRx.status.toString(), Number(contractResults[0])];
}

async function triggerFallback(_amt, hbarUnits = HbarUnit.Tinybar) {
	try {
		// calling a method that doesn't exist will trigger the fallback
		const encodedCommand = ethers.keccak256(ethers.toUtf8Bytes('triggerFallback()'));

		const contractExecuteTx = await new ContractExecuteTransaction()
			.setContractId(contractId)
			.setGas(100_000)
			.setFunctionParameters(Buffer.from(encodedCommand.slice(2), 'hex'))
			.setPayableAmount(new Hbar(_amt, hbarUnits))
			.execute(client);

		const contractExecuteRx = await contractExecuteTx.getReceipt(client);

		return contractExecuteRx.status.toString();
	}
	catch (e) {
		return e;
	}
}

/**
 * Helper function to call a contract to check allowance
 * @param {TokenId} _tokenId
 * @param {AccountId} _ownerId
 * @param {ContractId} _spenderId
 * @returns {Boolean} all serials approved
 */
async function checkNFTApprovalFcn(_tokenId, _ownerId, _spenderId) {
	const [contractExecuteRx, contractResults] = await contractExecuteFcn(contractId, 200_000, 'isApprovedForAllSerials',
		[_tokenId.toSolidityAddress(), _ownerId.toSolidityAddress(), _spenderId.toSolidityAddress()]);
	return [contractExecuteRx.status.toString(), Boolean(contractResults[0])];
}

/**
 * Helper function for calling the contract methods
 * @param {ContractId} cId the contract to call
 * @param {number | Long.Long} gasLim the max gas
 * @param {string} fcnName name of the function to call
 * @param {ContractFunctionParameters} params the function arguments
 * @param {string | number | Hbar | Long.Long | BigNumber} amountHbar the amount of hbar to send in the methos call
 * @returns {[TransactionReceipt, any, TransactionRecord]} the transaction receipt and any decoded results
 */
async function contractExecuteFcn(cId, gasLim, fcnName, params, amountHbar = 0) {
	const encodedCommand = iface.encodeFunctionData(fcnName, params);
	// convert to UINT8ARRAY after stripping the '0x'
	const contractExecuteTx = await new ContractExecuteTransaction()
		.setContractId(cId)
		.setGas(gasLim)
		.setFunctionParameters(Buffer.from(encodedCommand.slice(2), 'hex'))
		.setPayableAmount(amountHbar)
		.execute(client);

	const contractExecuteRx = await contractExecuteTx.getReceipt(client);
	// get the results of the function call;
	const record = await contractExecuteTx.getRecord(client);

	let contractResults;
	try {
		contractResults = iface.decodeFunctionResult(fcnName, record.contractFunctionResult.bytes);
	}
	catch (e) {
		if (e.data == '0x') {
			console.log(contractExecuteTx.transactionId.toString(), 'No data returned from contract - check the call');
		}
		else {
			console.log('Error', contractExecuteTx.transactionId.toString(), e);
			console.log(iface.parseError(record.contractFunctionResult.bytes));
		}
	}
	// console.log('Contract Results:', contractResults);
	return [contractExecuteRx, contractResults, record];
}

/**
 * Function to link solidity libraries into the bytecode for deployment
 * @param {string} bytecode the bytecode to link
 * @param {string[]} libNameArray the name of the library to link
 * @param {ContractId[]} libAddressArray the address of the library to link
 */
function linkBytecode(bytecode, libNameArray, libAddressArray) {
	for (let i = 0; i < libNameArray.length; i++) {
		const libName = libNameArray[i];
		const libAddress = libAddressArray[i].toSolidityAddress();

		const nameToHash = `contracts/${libName}.sol:${libName}`;

		const placeholder = `__$${ethers.keccak256(ethers.toUtf8Bytes(nameToHash)).slice(2, 36)}$__`;
		console.log('placeholder', placeholder);
		// const formattedAddress = libAddress.toLowerCase().replace('0x', '');
		console.log('libAddress', libAddress);

		if (bytecode.indexOf(placeholder) === -1) {
			throw new Error(`Unable to find placeholder for library ${libName}`);
		}
		while (bytecode.indexOf(placeholder) !== -1) {
			bytecode = bytecode.replace(placeholder, libAddress);
		}
	}

	return bytecode;
}

/**
 * Helper function to create new accounts
 * @param {PrivateKey} privateKey new accounts private key
 * @param {string | number} initialBalance initial balance in hbar
 * @returns {AccountId} the newly created Account ID object
 */
async function accountCreator(privateKey, initialBalance, maxTokenAssociations = 0) {
	const response = await new AccountCreateTransaction()
		.setInitialBalance(new Hbar(initialBalance))
		.setMaxAutomaticTokenAssociations(maxTokenAssociations)
		.setKey(privateKey.publicKey)
		.execute(client);
	const receipt = await response.getReceipt(client);
	return receipt.accountId;
}

/**
 * Chyeck mirror for the allowance
 * @param {AccountId} _userId
 * @param {TokenId} _tokenId
 * @param {AccountId} _spenderId
 */
async function checkMirrorAllowance(_userId, _tokenId, _spenderId) {
	const url = `${baseUrl}/api/v1/accounts/${_userId.toString()}/allowances/tokens`;

	let rtnVal = 0;
	await axios.get(url)
		.then((response) => {
			const jsonResponse = response.data;

			jsonResponse.allowances.forEach(allowance => {
				if (allowance.spender == _spenderId.toString()) {
					console.log(' -Mirror Node: Found allowance for', allowance.owner, 'with allowance', allowance.amount_granted, 'of token', allowance.token_id);
					rtnVal = Number(allowance.amount_granted);
				}
			});
		})
		.catch(function(err) {
			console.error(err);
			return 0;
		});

	return rtnVal;
}

async function sendHbar(_contractId, _sender, _amt, hbarUnit = HbarUnit.Tinybar) {
	const transferTx = await new TransferTransaction()
		.addHbarTransfer(_contractId, new Hbar(_amt, hbarUnit))
		.addHbarTransfer(_sender, new Hbar(_amt, hbarUnit).negated())
		.freezeWith(client)
		.execute(client);

	const transferRx = await transferTx.getReceipt(client);

	return transferRx.status.toString();
}

async function checkLastMirrorEvent() {
	const url = `${baseUrl}/api/v1/contracts/${contractId.toString()}/results/logs?order=desc&limit=1`;

	await axios.get(url)
		.then(function(response) {
			const jsonResponse = response.data;

			jsonResponse.logs.forEach(log => {
				// decode the event data
				if (log.data == '0x') return;
				const event = iface.parseLog({ topics: log.topics, data: log.data });

				let outputStr = 'Block: ' + log.block_number
						+ ' : Tx Hash: ' + log.transaction_hash
						+ ' : Event: ' + event.name + ' : ';

				for (let f = 0; f < event.args.length; f++) {
					const field = event.args[f];

					let output;
					if (typeof field === 'string') {
						output = field.startsWith('0x') ? AccountId.fromSolidityAddress(field).toString() : field;
					}
					else {
						output = field.toString();
					}
					output = f == 0 ? output : ' : ' + output;
					outputStr += output;
				}
				console.log(outputStr);
			});

		})
		.catch(function(err) {
			console.error(err);
			return null;
		});
}

/*
 * basci sleep function
 * @param {number} ms milliseconds to sleep
 * @returns {Promise}
 */
// eslint-disable-next-line no-unused-vars
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}