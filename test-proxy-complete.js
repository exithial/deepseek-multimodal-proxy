#!/usr/bin/env node

import axios from 'axios';

const PROXY_URL = 'http://localhost:7777';

async function testProxy() {
  console.log('🚀 Probando configuración completa del proxy...\n');

  try {
    // 1. Health check
    console.log('✅ Probando health check...');
    const health = await axios.get(`${PROXY_URL}/health`);
    console.log(`   Status: ${health.data.status}`);
    console.log(`   Service: ${health.data.service}`);
    console.log(`   Uptime: ${health.data.uptime.toFixed(1)}s\n`);

    // 2. Models endpoint
    console.log('✅ Probando endpoint de modelos...');
    const models = await axios.get(`${PROXY_URL}/v1/models`);
    const modelList = models.data.data.map(m => m.id);
    console.log(`   Modelos disponibles (${modelList.length}):`);
    modelList.forEach((model, i) => {
      console.log(`   ${i + 1}. ${model}`);
    });
    console.log();

    // 3. Test each model
    console.log('🧪 Probando cada modelo...\n');
    
    const testModels = [
      'vision-dsk-chat',
      'vision-dsk-reasoner', 
      'deepseek-vision-chat',
      'deepseek-vision-reasoner',
      'qwen2.5-instruct',
      'qwen2.5-7b-instruct',
      'deepseek-coder-instruct',
      'deepseek-coder-6.7b-instruct',
      'qwen2.5',
      'deepseek-coder'
    ];

    for (const model of testModels) {
      console.log(`📋 Probando modelo: ${model}`);
      try {
        const response = await axios.post(`${PROXY_URL}/v1/chat/completions`, {
          model: model,
          messages: [
            { role: 'user', content: 'Hola, responde con tu nombre y versión.' }
          ],
          temperature: 0.1,
          max_tokens: 50
        });

        const content = response.data.choices[0].message.content;
        const truncated = content.length > 60 ? content.substring(0, 60) + '...' : content;
        console.log(`   ✅ ${model}: OK`);
        console.log(`      Respuesta: ${truncated}\n`);
      } catch (error) {
        console.log(`   ❌ ${model}: ERROR`);
        console.log(`      ${error.response?.data?.error?.message || error.message}\n`);
      }
    }

    // 4. Test image detection (simulado)
    console.log('🖼️ Probando detección de imágenes (simulado)...');
    try {
      const response = await axios.post(`${PROXY_URL}/v1/chat/completions`, {
        model: 'vision-dsk-chat',
        messages: [
          { 
            role: 'user', 
            content: [
              { type: 'text', text: 'Describe esta imagen:' },
              { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=' } }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 100
      });

      console.log(`   ✅ Imagen procesada: OK`);
      console.log(`      Respuesta: ${response.data.choices[0].message.content.substring(0, 80)}...\n`);
    } catch (error) {
      console.log(`   ❌ Error procesando imagen: ${error.response?.data?.error?.message || error.message}\n`);
    }

    console.log('🎉 Pruebas completadas!');
    console.log('\n📋 Resumen:');
    console.log(`   - Proxy URL: ${PROXY_URL}`);
    console.log(`   - Modelos configurados: ${modelList.length}`);
    console.log(`   - Todos los modelos pasan por el proxy`);
    console.log(`   - Procesamiento de imágenes con Gemini habilitado`);

  } catch (error) {
    console.error('❌ Error general:', error.message);
    process.exit(1);
  }
}

testProxy();