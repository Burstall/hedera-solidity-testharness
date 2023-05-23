Basic shell to test out Heders Solidity implementation

# Impelemented so far
1. Allowance Check
2. Fallback / Recieve methods & special variables

## Results
Approval of FT / NFT check out
Sending HBAR using HTS does not trigger the receive code in the SC
Solidity calls to contract do trigger the code **AND** special variables are populated

# Local Instance
https://github.com/hashgraph/hedera-local-node#docker

docker compose up -d
docker-compose down -v; git clean -xfd; git reset --hard


Windows nonsense:
docker network ls
docker network rm XXXXX

(As Admin)
net stop winnat
-> start docker
net start winnat
