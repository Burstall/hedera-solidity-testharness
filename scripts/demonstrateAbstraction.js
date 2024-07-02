const { Client, AccountId, PrivateKey, TokenAssociateTransaction } = require('@hashgraph/sdk');
const {
	accountCreator,
	mintNFT,
} = require('../utils/hederaHelpers');
require('dotenv').config();

let client;
let operatorKey;
let operatorId;
let env = process.env.ENVIRONMENT;

async function main() {

    console.log('\n-Using ENIVRONMENT:', env);

    await setupEnv();    

    client.setOperator(operatorId, operatorKey);

    console.log('\n-Using Operator:', operatorId.toString());

    // generate a fresh account for alice
    const alicePK = PrivateKey.generateED25519();
    const aliceId = await accountCreator(client, alicePK, 0);

    console.log('\n-Generated Alice Account:', aliceId.toString());

    let result = await mintNFT(client, operatorId, 'AbstractionTestToken ' + aliceId.toString(), 'ATT', 1, 50); 
	tokenId = result[1];
	console.log('\n- NFT minted @', tokenId.toString(), 'transaction:', result[2], 'status:', result[0]);

    console.log('\n-Associate NFT to Alice, but gas fees paid by operator');

    const associateTokenTx = await new TokenAssociateTransaction()
		.setAccountId(aliceId)
		.setTokenIds([tokenId])
        .freezeWith(client);

    // Alice must still sign the Tx to allow association to their account
    const signTx = await associateTokenTx
		.sign(alicePK);
    
    // execution is via client object with operator as the payer
    const executedTx = await signTx.execute(client);

	const associateTokenRx = await executedTx.getReceipt(client);

	console.log('\n-Status:', associateTokenRx.status.toString(), 'transaction:', associateTokenTx.transactionId.toString());
}

async function setupEnv() {
    operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
    operatorKey = PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY);

    if (operatorKey === undefined || operatorKey == null || operatorId === undefined || operatorId == null) {
        throw Error('Environment required, please specify PRIVATE_KEY & ACCOUNT_ID in the .env file');
    }

    if (env.toUpperCase() == 'TEST') {
        client = Client.forTestnet();
        console.log('testing in *TESTNET*');
    }
    else if (env.toUpperCase() == 'MAIN') {
        client = Client.forMainnet();
        console.log('testing in *MAINNET*');
    }
    else if (env.toUpperCase() == 'PREVIEW') {
        client = Client.forPreviewnet();
        console.log('testing in *PREVIEWNET*');
    }
    else if (env.toUpperCase() == 'LOCAL') {
        const node = { '127.0.0.1:50211': new AccountId(3) };
        client = Client.forNetwork(node).setMirrorNetwork('127.0.0.1:5600');
        console.log('testing in *LOCAL*');
        const rootId = AccountId.fromString('0.0.2');
        const rootKey = PrivateKey.fromStringECDSA(
            '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137',
        );

        // create an operator account on the local node and use this for testing as operator
        client.setOperator(rootId, rootKey);
        operatorKey = PrivateKey.generateED25519();
        operatorId = await accountCreator(client, operatorKey, 1000);
    }
    else {
        throw new Error('ERROR: Must specify either MAIN or TEST or PREVIEW or LOCAL as environment in .env file');
    }
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});