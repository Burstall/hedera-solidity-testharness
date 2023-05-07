const {
	AccountId,
	ContractId,
} = require('@hashgraph/sdk');

require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { ethers } = require('ethers');

const baseUrlForMainnet = 'https://mainnet-public.mirrornode.hedera.com';
const baseUrlForTestnet = 'http://testnet.mirrornode.hedera.com';
const env = process.env.ENVIRONMENT ?? null;
const contractName = process.env.CONTRACT_NAME ?? null;

let abi, iface;


async function main() {
	console.log('Using ENIVRONMENT:', env);

	if (env === undefined || env == null) {
		console.log('Environment required, please specify TEST or MAIN in the .env file');
		return;
	}

	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}

	// import ABI
	const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`, 'utf8'));
	abi = json.abi;

	iface = new ethers.utils.Interface(abi);

	const contractId = ContractId.fromString(process.env.CONTRACT_ID);

	// get contract events from a mirror node
	await getEventsFromMirror(contractId);
}

/**
 * Gets all the events for a given ContractId from a mirror node
 * @param contractId
 */

async function getEventsFromMirror(contractId) {
	console.log('\n -Getting event(s) from mirror nodes');

	const baseUrl = env.toUpperCase() == 'MAIN' ? baseUrlForMainnet : baseUrlForTestnet;

	let url = `${baseUrl}/api/v1/contracts/${contractId.toString()}/results/logs?order=desc&limit=100`;
	while (url) {
		console.log(url);

		await axios.get(url)
			.then(function(response) {
				const jsonResponse = response.data;
				// console.log(' -Got', jsonResponse, 'events from mirror node');

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


				if (jsonResponse.links.next) {
					url = baseUrl + jsonResponse.links.next;
				}
				else {
					url = null;
				}
			})
			.catch(function(err) {
				console.error(err);
				url = null;
				return;
			});
	}
}

void main();