import { config } from '../../../core/config';
import { logger } from '../../../core/logger';
import { ServiceUnavailableError, AppError } from '../../../core/errors';
import type { AIPromptConfig } from '../../../shared/types';

type Provider = 'openai' | 'anthropic';

interface UpstreamResponse {
  status: number;
  json: any;
  text: string;
}

const request = async (url: string, init: RequestInit): Promise<UpstreamResponse> => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(config.ai.timeoutMs),
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
};

export class AIService {
  private readonly promptTemplates = new Map<string, string>();

  constructor() {
    this.initializeDefaultTemplates();
  }

  private initializeDefaultTemplates(): void {
    this.promptTemplates.set(
      'code-review',
      'Please review the following code and provide feedback:\n\n{code}\n\nFocus on: correctness, performance, security, and best practices.'
    );
    this.promptTemplates.set(
      'documentation',
      'Generate documentation for the following code:\n\n{code}\n\nInclude: description, parameters, return value, and usage examples.'
    );
    this.promptTemplates.set(
      'test-generation',
      'Generate unit tests for the following code:\n\n{code}\n\nUse an appropriate testing framework and cover edge cases.'
    );
    this.promptTemplates.set(
      'bug-fix',
      'Analyze the following code and suggest fixes for potential bugs:\n\n{code}\n\nExplain the issue and provide corrected code.'
    );
  }

  addPromptTemplate(name: string, template: string): void {
    this.promptTemplates.set(name, template);
  }

  getPrompt(templateName: string, variables: Record<string, string>): string {
    const template = this.promptTemplates.get(templateName);
    if (!template) {
      throw new AppError(`Prompt template "${templateName}" not found`, 404, 'NOT_FOUND');
    }

    return Object.entries(variables).reduce(
      (result, [key, value]) => result.split(`{${key}}`).join(String(value)),
      template
    );
  }

  listPromptTemplates(): string[] {
    return Array.from(this.promptTemplates.keys());
  }

  async generateCompletion(options: {
    prompt: string;
    provider?: Provider;
    config?: AIPromptConfig;
  }): Promise<string> {
    const provider = options.provider ?? 'openai';
    return provider === 'openai'
      ? this.generateOpenAICompletion(options.prompt, options.config)
      : this.generateAnthropicCompletion(options.prompt, options.config);
  }

  private ensureKey(provider: Provider): string {
    const key = provider === 'openai' ? config.ai.openaiKey : config.ai.anthropicKey;
    if (!key) {
      throw new ServiceUnavailableError(
        `${provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} is not configured`
      );
    }
    return key;
  }

  private async generateOpenAICompletion(
    prompt: string,
    promptConfig?: AIPromptConfig
  ): Promise<string> {
    const apiKey = this.ensureKey('openai');

    let upstream: UpstreamResponse;
    try {
      upstream = await request('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: promptConfig?.model ?? 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: promptConfig?.temperature ?? 0.7,
          max_tokens: promptConfig?.maxTokens ?? 1000,
        }),
      });
    } catch (error) {
      logger.error('openai request failed', { message: (error as Error).message });
      throw new ServiceUnavailableError('OpenAI request failed or timed out');
    }

    if (upstream.status >= 400) {
      const message = upstream.json?.error?.message ?? upstream.text.slice(0, 300);
      logger.warn('openai returned an error', { status: upstream.status, message });
      throw new AppError(
        `OpenAI request failed: ${message}`,
        upstream.status === 429 ? 429 : 502,
        upstream.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR'
      );
    }

    const content = upstream.json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new ServiceUnavailableError('OpenAI returned an unexpected response shape');
    }
    return content;
  }

  private async generateAnthropicCompletion(
    prompt: string,
    promptConfig?: AIPromptConfig
  ): Promise<string> {
    const apiKey = this.ensureKey('anthropic');

    let upstream: UpstreamResponse;
    try {
      upstream = await request('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: promptConfig?.model ?? 'claude-3-5-sonnet-latest',
          max_tokens: promptConfig?.maxTokens ?? 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (error) {
      logger.error('anthropic request failed', { message: (error as Error).message });
      throw new ServiceUnavailableError('Anthropic request failed or timed out');
    }

    if (upstream.status >= 400) {
      const message = upstream.json?.error?.message ?? upstream.text.slice(0, 300);
      logger.warn('anthropic returned an error', { status: upstream.status, message });
      throw new AppError(
        `Anthropic request failed: ${message}`,
        upstream.status === 429 ? 429 : 502,
        upstream.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR'
      );
    }

    const content = upstream.json?.content?.[0]?.text;
    if (typeof content !== 'string') {
      throw new ServiceUnavailableError('Anthropic returned an unexpected response shape');
    }
    return content;
  }
}
