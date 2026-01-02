import { Router } from 'express';
import { AIService } from './src/ai.service';
import { createAIRoutes } from './src/ai.controller';
import { ModuleMetadata } from '../../shared/types';

export class AIHelpersModule {
  public readonly metadata: ModuleMetadata = {
    name: 'ai-helpers',
    version: '1.0.0',
    description: 'AI integration and prompt management module',
    enabled: true,
  };

  public readonly service: AIService;
  public readonly router: Router;

  constructor() {
    this.service = new AIService();
    this.router = createAIRoutes(this.service);
  }

  async initialize(): Promise<void> {
    console.log(`[${this.metadata.name}] Module initialized`);
  }

  async shutdown(): Promise<void> {
    console.log(`[${this.metadata.name}] Module shutdown`);
  }
}

export const aiHelpersModule = new AIHelpersModule();
