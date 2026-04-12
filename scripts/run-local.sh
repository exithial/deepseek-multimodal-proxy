#!/bin/bash
cd "$(dirname "$0")/.."
# Cargar NVM de forma genérica si existe
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
nvm use 24.13.0 --silent || node -v
node dist/index.js

