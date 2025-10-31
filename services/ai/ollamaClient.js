const axios = require('axios');
const logger = require('../../utils/logger');

/**
 * Ollama API Client
 * Handles all communication with Ollama service
 */
class OllamaClient {
  static baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  static analysisModel = 'tinyllama:1.1b';  // For analysis tasks (query expansion, filtering)
  static segregationModel = 'gpt2';          // For categorization/segregation tasks
  static timeout = 60000; // 60 seconds

  /**
   * Call Ollama API with specified model
   * @param {string} prompt - The prompt to send
   * @param {object} options - Options for the call
   * @param {string} options.model - Override model name
   * @param {boolean} options.useSegregationModel - Use GPT-2 instead of TinyLlama
   * @param {number} options.temperature - Temperature (0-1)
   * @param {number} options.max_tokens - Max tokens to generate
   * @returns {Promise<string>} AI response text
   */
  static async call(prompt, options = {}) {
    try {
      // Use segregationModel for categorization tasks, analysisModel for others
      const model = options.model || (options.useSegregationModel ? this.segregationModel : this.analysisModel);
      
      logger.info(`🤖 Calling Ollama at ${this.baseUrl} with model: ${model}`);
      
      // Adjust context size based on model
      const contextSize = model.includes('tinyllama') ? 2048 : 4096;
      
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: options.temperature || 0.3,
          max_tokens: options.max_tokens || (model.includes('tinyllama') ? 800 : 1000),
          num_ctx: contextSize
        }
      }, {
        timeout: this.timeout,
        validateStatus: function (status) {
          return status < 500; // Don't throw for 4xx errors
        }
      });

      if (response.status >= 400) {
        logger.error(`❌ Ollama API returned error status ${response.status}:`, response.data);
        throw new Error(`Ollama API error: ${response.status} - ${response.data?.error || 'Unknown error'}`);
      }

      if (!response.data || !response.data.response) {
        logger.error('❌ Ollama API returned invalid response:', response.data);
        throw new Error('Invalid response from Ollama API');
      }

      logger.info(`✅ Ollama API call successful for model: ${model}`);
      return response.data.response;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        logger.error(`❌ Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running?`);
        throw new Error(`Ollama service unavailable at ${this.baseUrl}. Please check if Ollama is running.`);
      } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        logger.error(`❌ Ollama API call timed out after ${this.timeout}ms`);
        throw new Error(`AI model (${model}) request timed out. The model may be overloaded or not loaded.`);
      } else if (error.response) {
        logger.error(`❌ Ollama API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        throw new Error(`AI model (${model}) error: ${error.response.data?.error || error.message}`);
      } else {
        logger.error('Ollama API call failed:', error.message);
        throw error;
      }
    }
  }

  /**
   * Get model name based on task type
   * @param {boolean} useSegregationModel - Whether to use segregation model
   * @returns {string} Model name
   */
  static getModel(useSegregationModel = false) {
    return useSegregationModel ? this.segregationModel : this.analysisModel;
  }
}

module.exports = OllamaClient;

