#!/bin/bash

echo "checking for old hardhat EVMs"

# kill any process using port 8545
process_id=$(lsof -t -i :8545)
if [[ -n $process_id ]]; then
  kill $process_id
  echo "Killed old hardhat EVM" | tee -a output.txt
fi

echo "starting tests"

echo " " | tee -a output.txt

start_time=$(date)
echo "Started full test at $start_time" | tee -a output.txt

echo "Running yarn install" | tee -a output.txt
yarn install

echo "Running yarn run coverage (solidity)" | tee -a output.txt
yarn run coverage

echo "Running yarn run test (solidity)" | tee -a output.txt
yarn run test

echo "Starting local hardhat EVM" | tee -a output.txt
yarn run start &
start_pid=$!
echo "hardhat EVM pid is $start_pid" | tee -a output.txt

sleep 5

echo "Deploying contracts" | tee -a output.txt
yarn run deploy:local &
deploy_pid=$!
echo "deployment script pid is $deploy_pid" | tee -a output.txt

echo "waiting for mining operations to complete"
sleep 30

echo "Killing background processes" | tee -a output.txt
echo "killing hardhat EVM at $start_pid" | tee -a output.txt
kill -9 $start_pid 
echo "killing deployment script at $deploy_pid" | tee -a output.txt
kill -9 $deploy_pid 

end_time=$(date)
echo "Full test completed at $end_time" | tee -a output.txt

echo " " | tee -a output.txt

# kill any process using port 8545
process_id=$(lsof -t -i :8545)
if [[ -n $process_id ]]; then
  kill $process_id
  echo "Killed hardhat EVM" | tee -a output.txt
fi

echo "Running yarn run format" | tee -a output.txt
yarn run format

echo "Running yarn run docgen" | tee -a output.txt
yarn run docgen

echo "Running yarn run metrics" | tee -a output.txt
yarn run metrics