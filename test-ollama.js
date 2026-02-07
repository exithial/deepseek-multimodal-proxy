#!/usr/bin/env node

import axios from 'axios';

async function testOllamaModels() {
  console.log('🧪 Probando modelos Ollama...\n');
  
  const baseURL = 'http://localhost:7777/v1';
  
  const models = [
    'qwen2.5-instruct',
    'qwen2.5-7b-instruct',
    'deepseek-coder-instruct',
    'deepseek-coder-6.7b-instruct',
    'qwen2.5',
    'deepseek-coder',
  ];
  
  for (const model of models) {
    console.log(`📋 Probando modelo: ${model}`);
    
    try {
      const response = await axios.post(
        `${baseURL}/chat/completions`,
        {
          model: model,
          messages: [
            {
              role: 'user',
              content: 'Hola, ¿puedes decirme qué modelo eres? Responde brevemente.',
            }
          ],
          max_tokens: 100,
          temperature: 0.7,
        },
        {
          timeout: 30000,
        }
      );
      
      console.log(`✅ ${model}: OK`);
      console.log(`   Respuesta: ${response.data.choices[0].message.content.substring(0, 100)}...\n`);
      
    } catch (error) {
      console.log(`❌ ${model}: ERROR`);
      console.log(`   ${error.message}\n`);
    }
  }
  
  console.log('🎯 Probando endpoint de modelos...');
  
  try {
    const response = await axios.get(`${baseURL}/models`);
    const availableModels = response.data.data.map(m => m.id);
    console.log(`✅ Modelos disponibles: ${availableModels.join(', ')}`);
  } catch (error) {
    console.log(`❌ Error obteniendo modelos: ${error.message}`);
  }
}

async function testDeepSeekModels() {
  console.log('\n🧪 Probando modelos DeepSeek...\n');
  
  const baseURL = 'http://localhost:7777/v1';
  
  const models = [
    'vision-dsk-chat',
    'vision-dsk-reasoner',
    'deepseek-vision-chat',
    'deepseek-vision-reasoner',
  ];
  
  for (const model of models) {
    console.log(`📋 Probando modelo: ${model}`);
    
    try {
      const response = await axios.post(
        `${baseURL}/chat/completions`,
        {
          model: model,
          messages: [
            {
              role: 'user',
              content: 'Hola, ¿puedes decirme qué modelo eres? Responde brevemente.',
            }
          ],
          max_tokens: 100,
          temperature: 0.7,
        },
        {
          timeout: 30000,
        }
      );
      
      console.log(`✅ ${model}: OK`);
      console.log(`   Respuesta: ${response.data.choices[0].message.content.substring(0, 100)}...\n`);
      
    } catch (error) {
      console.log(`❌ ${model}: ERROR`);
      console.log(`   ${error.message}\n`);
    }
  }
}

async function main() {
  console.log('🚀 Iniciando pruebas del proxy...\n');
  
  try {
    // Primero probar salud del servicio
    const healthResponse = await axios.get('http://localhost:7777/health');
    console.log(`✅ Servicio saludable: ${JSON.stringify(healthResponse.data)}\n`);
    
    await testOllamaModels();
    await testDeepSeekModels();
    
    console.log('🎉 Todas las pruebas completadas!');
    
  } catch (error) {
    console.log(`❌ No se pudo conectar al proxy: ${error.message}`);
    console.log('   Asegúrate de que el servicio esté corriendo en http://localhost:7777');
    process.exit(1);
  }
}

main().catch(console.error);