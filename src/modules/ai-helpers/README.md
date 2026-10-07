# AI helpers module

LLM integration over plain HTTP: chat completions, a prompt-template registry, and log-analysis helpers for OpenAI and Anthropic.

## Features

- `generateCompletion()` targeting OpenAI or Anthropic with configurable model, temperature, and token cap
- Prompt templates with `{variable}` interpolation — built-ins: `code-review`, `documentation`, `test-generation`, `bug-fix` — plus `addPromptTemplate()` for your own
- Structured log analysis (`summary`, `rootCause`, `recommendations`, `severity`) with a raw-text fallback when the model returns non-JSON
- Endpoint explainer that returns purpose, request/response expectations, and a curl example
- Request timeout via `AbortSignal` and mapped errors: missing API key → 503, provider 429 → 429, other upstream failures → 502
- Mounted by core at `/api/ai` behind the `api` rate limiter

## Usage

```typescript
import { aiHelpersModule, AIService, aiLogAnalyzerService } from '../../modules/ai-helpers';

const completion = await aiHelpersModule.service.generateCompletion({
  prompt: 'Write a hello world function',
  provider: 'openai', // or 'anthropic'
  config: { model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 500 },
});

const prompt = aiHelpersModule.service.getPrompt('code-review', { code });
const names = aiHelpersModule.service.listPromptTemplates();

const analysis = await aiLogAnalyzerService.analyzeLogs({ logs, error }, 'anthropic');
```

### HTTP routes (no auth; throttled by the `api` limiter)

| Method | Path                      | Body / notes                              |
| ------ | ------------------------- | ----------------------------------------- |
| POST   | `/api/ai/complete`        | `{ prompt, provider?, model?, temperature?, maxTokens? }` |
| POST   | `/api/ai/template/:name`  | `{ variables, provider?, ... }` → `{ prompt, completion }` |
| GET    | `/api/ai/templates`       | list template names                       |
| POST   | `/api/ai/analyze-logs`    | `{ logs[], error?, context?, provider? }` |
| POST   | `/api/ai/explain`         | `{ path, method?, provider? }`            |

## Configuration

| Variable            | Purpose                                     | Default |
| ------------------- | ------------------------------------------- | ------- |
| `OPENAI_API_KEY`    | Enables the `openai` provider               | unset   |
| `ANTHROPIC_API_KEY` | Enables the `anthropic` provider            | unset   |
| `AI_TIMEOUT_MS`     | Upstream request timeout                    | `30000` |
| `MODULE_AI_HELPERS` | Mount the module                            | `true`  |

## Notes

- Routes are unauthenticated but rate-limited (60 requests/minute via the shared `api` limiter).
- Defaults: model `gpt-4o-mini` (OpenAI) or `claude-3-5-sonnet-latest` (Anthropic), `maxTokens` 1000; prompts are capped at 32 000 characters and `maxTokens` at 8000.
- Responses are non-streaming; timeouts and connection errors surface as `503`.
