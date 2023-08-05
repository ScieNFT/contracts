#!/bin/bash

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

echo "Running yarn run format" | tee -a output.txt
yarn run format

echo "Running yarn run docgen" | tee -a output.txt
yarn run docgen

echo "Running yarn run metrics" | tee -a output.txt
yarn run metrics

end_time=$(date)
echo "Full test completed at $end_time" | tee -a output.txt

echo " " | tee -a output.txt
