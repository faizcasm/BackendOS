import type { Router } from 'express';
import { AIService } from './src/ai.service';
import { createAIRoutes } from './src/ai.controller';
import { config } from '../../core/config';
import { logger } from '../../core/logger';
import type { ModuleMetadata } from '../../shared/types';

export * from './src/ai.service';
export * from './src/ai.controller';
export * from './src/log-analyzer.service';

export class AIHelpersModule {
  public readonly metadata: ModuleMetadata = {
    name: 'ai-helpers',
    version: '2.0.0',
    description: 'LLM integration with prompt templates (OpenAI / Anthropic)',
    enabled: true,
  };

  public readonly service: AIService;
  public readonly router: Router;

  constructor() {
    this.service = new AIService();
    this.router = createAIRoutes(this.service);
  }

  async initialize(): Promise<void> {
    const providers = [
      config.ai.openaiKey ? 'openai' : null,
      config.ai.anthropicKey ? 'anthropic' : null,
    ].filter(Boolean);

    logger.info('ai-helpers module initialized', {
      providers: providers.length > 0 ? providers : ['none configured'],
    });
  }

  async shutdown(): Promise<void> {
    // Outbound HTTP needs no teardown.
  }
}

export const aiHelpersModule = new AIHelpersModule();
