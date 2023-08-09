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
	// eslint-disable-next-line no-unused-vars
	ContractFunctionParameters,
	ContractExecuteTransaction,
	// eslint-disable-next-line no-unused-vars
	TokenId,
	// eslint-disable-next-line no-unused-vars
	ContractId,
	ContractCallQuery,

} = require('@hashgraph/sdk');
require('dotenv').config();

// Get operator from .env file
let operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
let operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = 'Factory';
const env = process.env.ENVIRONMENT ?? null;

const addressRegex = /(\d+\.\d+\.[1-9]\d+)/i;

// reused variable
let contractId;
let contractAddress;
let abi, iface;
let alicePK, aliceId;
let client;

const FIRST_MESSAGE = 'First';
const SECOND_MESSAGE = 'Second';
const THIRD_MESSAGE = 'Third';

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
		}
		else if (env.toUpperCase() == 'MAIN') {
			client = Client.forMainnet();
			console.log('testing in *MAINNET*');
		}
		else if (env.toUpperCase() == 'LOCAL') {
			const node = { '127.0.0.1:50211': new AccountId(3) };
			client = Client.forNetwork(node).setMirrorNetwork('127.0.0.1:5600');
			console.log('testing in *LOCAL*');
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

		const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`));

		// import ABI
		abi = json.abi;
		iface = ethers.Interface.from(abi);

		const contractBytecode = json.bytecode;

		console.log('\n- Deploying contract...', contractName, '\n\tgas@', gasLimit);

		contractId = await contractDeployFcn(contractBytecode, gasLimit);
		contractAddress = contractId.toSolidityAddress();

		console.log(`Contract created with ID: ${contractId} / ${contractAddress}`);

		console.log('\n-Testing:', contractName);
		// create Alice account
		alicePK = PrivateKey.generateED25519();
		aliceId = await accountCreator(alicePK, 10);
		console.log('Alice account ID:', aliceId.toString(), '\nkey:', alicePK.toString());

		expect(contractId.toString().match(addressRegex).length == 2).to.be.true;
	});
});

describe('Testing Factory: ', function() {
	it('Alice uses Factor to spawn to Greeters', async function() {
		client.setOperator(aliceId, alicePK);
		let result = await createGreeter(FIRST_MESSAGE);
		expect(result).to.be.equal('SUCCESS');
		result = await createGreeter(SECOND_MESSAGE);
		expect(result).to.be.equal('SUCCESS');
	});

	it('Alice checks the messages', async function() {
		client.setOperator(aliceId, alicePK);
		let message = await checkMessages(0);
		expect(message[0]).to.be.equal(FIRST_MESSAGE);
		message = await checkMessages(1);
		expect(message[0]).to.be.equal(SECOND_MESSAGE);
	});

	it('Operator updates the message', async function() {
		client.setOperator(operatorId, operatorKey);
		const res = await updateMessage(0, THIRD_MESSAGE);
		expect(res).to.be.equal('SUCCESS');

		const message = await checkMessages(0);
		expect(message[0]).to.be.equal(THIRD_MESSAGE);
	});

});

async function createGreeter(message) {
	const [contractExecuteRx] = await contractExecuteFcn(contractId, 500_000, 'createNewGreeter', [message]);
	return contractExecuteRx.status.toString();
}

async function checkMessages(index) {
	return await contractQueryFcn(contractId, 500_000, 'gfGetter', [index]);
}

async function updateMessage(index, message) {
	const [contractExecuteRx] = await contractExecuteFcn(contractId, 500_000, 'gfSetter', [index, message]);
	return contractExecuteRx.status.toString();
}

/**
 * Helper function for calling view functions on a contract
 * @param {ContractId} cId the contract to call
 * @param {number | Long.Long} gasLim the max gas
 * @param {string} fcnName name of the function to call
 * @param {ContractFunctionParameters} params the function arguments
 * @param {string | number | Hbar | Long.Long | BigNumber} amountHbar max pmt
 * @returns {} decoded results
 */
async function contractQueryFcn(cId, gasLim, fcnName, params, amountHbar = 2) {
	const encodedCommand = iface.encodeFunctionData(fcnName, params);
	// convert to UINT8ARRAY after stripping the '0x'
	const contractCall = await new ContractCallQuery()
		.setContractId(cId)
		.setGas(gasLim)
		.setFunctionParameters(Buffer.from(encodedCommand.slice(2), 'hex'))
		.setMaxQueryPayment(new Hbar(amountHbar))
		.execute(client);

	return iface.decodeFunctionResult(fcnName, contractCall.bytes);

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