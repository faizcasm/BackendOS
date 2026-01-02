import axios from 'axios';
import { config } from '../../../shared/utils/config';
import { AIPromptConfig } from '../../../shared/types';

export class AIService {
  private promptTemplates: Map<string, string> = new Map();

  constructor() {
    this.initializeDefaultTemplates();
  }

  private initializeDefaultTemplates(): void {
    this.promptTemplates.set('code-review', 
      'Please review the following code and provide feedback:\n\n{code}\n\nFocus on: correctness, performance, security, and best practices.');
    
    this.promptTemplates.set('documentation', 
      'Generate documentation for the following code:\n\n{code}\n\nInclude: description, parameters, return value, and usage examples.');
    
    this.promptTemplates.set('test-generation', 
      'Generate unit tests for the following code:\n\n{code}\n\nUse appropriate testing framework and cover edge cases.');
    
    this.promptTemplates.set('bug-fix', 
      'Analyze the following code and suggest fixes for potential bugs:\n\n{code}\n\nExplain the issue and provide corrected code.');
  }

  addPromptTemplate(name: string, template: string): void {
    this.promptTemplates.set(name, template);
  }

  getPrompt(templateName: string, variables: Record<string, string>): string {
    const template = this.promptTemplates.get(templateName);
    if (!template) {
      throw new Error(`Prompt template '${templateName}' not found`);
    }

    let prompt = template;
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(`{${key}}`, value);
    }

    return prompt;
  }

  async generateCompletion(options: {
    prompt: string;
    provider?: 'openai' | 'anthropic';
    config?: AIPromptConfig;
  }): Promise<string> {
    const provider = options.provider || 'openai';

    if (provider === 'openai') {
      return this.generateOpenAICompletion(options.prompt, options.config);
    } else if (provider === 'anthropic') {
      return this.generateAnthropicCompletion(options.prompt, options.config);
    }

    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  private async generateOpenAICompletion(
    prompt: string,
    promptConfig?: AIPromptConfig
  ): Promise<string> {
    if (!config.ai.openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: promptConfig?.model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: promptConfig?.temperature || 0.7,
          max_tokens: promptConfig?.maxTokens || 1000,
        },
        {
          headers: {
            'Authorization': `Bearer ${config.ai.openaiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  private async generateAnthropicCompletion(
    prompt: string,
    promptConfig?: AIPromptConfig
  ): Promise<string> {
    if (!config.ai.anthropicKey) {
      throw new Error('Anthropic API key not configured');
    }

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: promptConfig?.model || 'claude-3-sonnet-20240229',
          messages: [{ role: 'user', content: prompt }],
          temperature: promptConfig?.temperature || 0.7,
          max_tokens: promptConfig?.maxTokens || 1000,
        },
        {
          headers: {
            'x-api-key': config.ai.anthropicKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.content[0].text;
    } catch (error: any) {
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  listPromptTemplates(): string[] {
    return Array.from(this.promptTemplates.keys());
  }
}
