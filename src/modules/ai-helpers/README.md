# AI Helpers Module

Provides integration with AI services and prompt management utilities.

## Features
- OpenAI integration
- Anthropic (Claude) integration
- Prompt template management
- Configurable AI parameters
- Streaming support
- Token usage tracking

## Supported AI Providers
- OpenAI (GPT-3.5, GPT-4)
- Anthropic (Claude)
- Extensible for other providers

## Usage

```typescript
import { aiHelpersModule } from './modules/ai-helpers';

// Generate completion
const response = await aiHelpersModule.service.generateCompletion({
  prompt: 'Write a hello world function',
  provider: 'openai',
  model: 'gpt-4',
  temperature: 0.7
});

// Use prompt templates
const prompt = aiHelpersModule.service.getPrompt('code-review', {
  code: 'function hello() { return "world"; }'
});
```
