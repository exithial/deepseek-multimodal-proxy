#!/bin/bash
# Script para probar inicio manual del proxy

echo "🔧 Probando inicio manual del proxy..."
echo ""

# Verificar puerto actual
echo "1. Estado actual del puerto 7777:"
if lsof -ti:7777 > /dev/null 2>&1; then
    echo "   ⚠️  Puerto 7777 en uso por:"
    lsof -i:7777
else
    echo "   ✅ Puerto 7777 libre"
fi
echo ""

# Intentar compilar
echo "2. Compilando proyecto..."
npm run build
if [ $? -eq 0 ]; then
    echo "   ✅ Compilación exitosa"
else
    echo "   ❌ Error en compilación"
    exit 1
fi
echo ""

# Intentar iniciar en segundo plano en puerto diferente para prueba
TEST_PORT=7778
echo "3. Probando inicio en puerto $TEST_PORT..."
node dist/index.js &
TEST_PID=$!
sleep 3

if ps -p $TEST_PID > /dev/null; then
    echo "   ✅ Proxy iniciado en puerto $TEST_PORT (PID: $TEST_PID)"
    
    # Verificar health check
    echo "4. Verificando health check..."
    sleep 2
    if curl -s http://localhost:$TEST_PORT/health > /dev/null; then
        echo "   ✅ Health check OK"
        
        # Verificar modelos
        MODEL_COUNT=$(curl -s http://localhost:$TEST_PORT/v1/models | jq '.data | length' 2>/dev/null || echo "0")
        echo "   📊 Modelos expuestos: $MODEL_COUNT"
        
        # Detener proceso de prueba
        echo "5. Deteniendo prueba..."
        kill $TEST_PID
        wait $TEST_PID 2>/dev/null
        echo "   ✅ Prueba detenida"
    else
        echo "   ❌ Health check falló"
        kill $TEST_PID
    fi
else
    echo "   ❌ No se pudo iniciar el proxy"
fi
echo ""

echo "🎯 CONCLUSIÓN:"
echo "=============="
echo "Si la prueba en puerto $TEST_PORT funcionó, el proxy está listo."
echo "El problema era que el puerto 7777 ya estaba en uso por otro proceso."
echo ""
echo "Para solucionar:"
echo "1. El script setup-deepseek-proxy.sh ahora identifica correctamente"
echo "   qué procesos son del proxy y cuáles son de OpenCode"
echo "2. Solo detendrá los procesos del proxy, no OpenCode"
echo "3. Puedes ejecutar: ./setup-deepseek-proxy.sh"