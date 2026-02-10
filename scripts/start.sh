#!/bin/bash
cd "$(dirname "$0")/.."
source /home/exithial/.nvm/nvm.sh
nvm use 24.13.0
node dist/index.js
