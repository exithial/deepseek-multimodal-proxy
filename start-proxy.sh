#!/bin/bash
# Wrapper script para iniciar el proxy con nvm

# Cargar nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Usar la versión específica de Node.js
nvm use 24.13.0

# Ejecutar el proxy
exec node /home/exithial/Proyectos/deepseek-vision-proxy/dist/index.js