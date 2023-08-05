#!/bin/bash

echo "checking for old hardhat EVMs"

# kill any process using port 8545
process_id=$(lsof -t -i :8545)
if [[ -n $process_id ]]; then
  kill $process_id
  echo "Killed old hardhat EVM" | tee -a output.txt
fi

# kill any process using port 3000
process_id=$(lsof -t -i :3000)
if [[ -n $process_id ]]; then
  kill $process_id
  echo "Killed old RPC service" | tee -a output.txt
fi

echo "starting tests"

echo " " | tee -a output.txt

start_time=$(date)
echo "Started full test at $start_time" | tee -a output.txt

echo "Running yarn install" | tee -a output.txt
yarn install

echo "Running yarn run buf:lint" | tee -a output.txt
yarn run buf:lint

echo "Running yarn run buf:format" | tee -a output.txt
yarn run buf:format

echo "Running yarn run coverage (solidity)" | tee -a output.txt
yarn run coverage

echo "Running yarn run test (solidity)" | tee -a output.txt
yarn run test

echo "Removing config" | tee -a output.txt
yarn run rimrafAll
sleep 2

echo "Running yarn run nest:build (RPC service)" | tee -a output.txt
yarn run nest:build

echo "Running yarn run nest:test (RPC service unit tests)" | tee -a output.txt
yarn run nest:test

echo "Running yarn run build (solidity)" | tee -a output.txt
yarn run build

echo "Starting local hardhat EVM" | tee -a output.txt
yarn run start &
start_pid=$!
echo "hardhat EVM pid is $start_pid" | tee -a output.txt

sleep 5

echo "Deploying contracts" | tee -a output.txt
yarn run deploy:local &
deploy_pid=$!
echo "deployment script pid is $deploy_pid" | tee -a output.txt

echo "Waiting for mining operations to complete"
sleep 15

echo "Allocating wallets"
npx hardhat run --network localhost tools/allocateWallets.ts

yarn run rimrafAll
sleep 2

echo "Starting RPC service attached to local hardhat EVM" | tee -a output.txt
yarn run nest:start:local &
nest_start_pid=$!
echo "RPC service pid is $nest_start_pid" | tee -a output.txt

sleep 20

echo "Running end-to-end tests" | tee -a output.txt
yarn run e2etest

echo "Killing all background processes" | tee -a output.txt
echo "killing hardhat EVM at $start_pid" | tee -a output.txt
kill -9 $start_pid 
echo "killing deployment script at $deploy_pid" | tee -a output.txt
kill -9 $deploy_pid 
echo "killing RPC service at $nest_start_pid" | tee -a output.txt
kill -9 $nest_start_pid

end_time=$(date)
echo "Full test completed at $end_time" | tee -a output.txt

echo " " | tee -a output.txt

# kill any process using port 8545
process_id=$(lsof -t -i :8545)
if [[ -n $process_id ]]; then
  kill $process_id
  echo "Killed hardhat EVM" | tee -a output.txt
fi

# kill any process using port 3000
process_id=$(lsof -t -i :3000)
if [[ -n $process_id ]]; then
  kill $process_id
  echo "Killed old RPC service" | tee -a output.txt
fi

echo "Running yarn run format" | tee -a output.txt
yarn run format

echo "Running yarn run docgen" | tee -a output.txt
yarn run docgen

echo "Running yarn run metrics" | tee -a output.txt
yarn run metrics
