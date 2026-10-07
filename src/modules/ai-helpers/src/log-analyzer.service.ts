import { config } from '../../../core/config';
import { logger } from '../../../core/logger';
import { AppError, ServiceUnavailableError } from '../../../core/errors';

export interface LogAnalysisRequest {
  logs: string[];
  error?: string;
  context?: Record<string, unknown>;
}

export interface LogAnalysisResponse {
  summary: string;
  rootCause?: string;
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

type Provider = 'openai' | 'anthropic';

const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

const callProvider = async (provider: Provider, payload: unknown): Promise<string> => {
  const isOpenAI = provider === 'openai';
  const key = isOpenAI ? config.ai.openaiKey : config.ai.anthropicKey;
  if (!key) {
    throw new ServiceUnavailableError(
      `${isOpenAI ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} is not configured`
    );
  }

  const url = isOpenAI
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.anthropic.com/v1/messages';
  const headers = isOpenAI
    ? { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
    : { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.ai.timeoutMs),
    });
  } catch (error) {
    logger.error('ai provider request failed', { provider, message: (error as Error).message });
    throw new ServiceUnavailableError(`${provider} request failed or timed out`);
  }

  const body: any = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message ?? `status ${response.status}`;
    throw new AppError(`${provider} request failed: ${message}`, 502, 'UPSTREAM_ERROR');
  }

  const content = isOpenAI ? body?.choices?.[0]?.message?.content : body?.content?.[0]?.text;
  if (typeof content !== 'string') {
    throw new AppError(`${provider} returned an unexpected response shape`, 502, 'UPSTREAM_ERROR');
  }
  return content;
};

/**
 * Turns noisy application logs into a structured incident summary using an
 * LLM. Results are best-effort parsed and always degrade to raw text.
 */
export class AILogAnalyzerService {
  async analyzeLogs(
    request: LogAnalysisRequest,
    provider: Provider = 'openai'
  ): Promise<LogAnalysisResponse> {
    const prompt = this.buildAnalysisPrompt(request);
    const content = await callProvider(
      provider,
      provider === 'openai'
        ? {
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'You are an expert backend engineer analyzing application logs. Respond with JSON only.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 1000,
          }
        : {
            model: 'claude-3-5-sonnet-latest',
            system:
              'You are an expert backend engineer analyzing application logs. Respond with JSON only.',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 1000,
          }
    );

    return this.parseAIResponse(content);
  }

  async explainEndpoint(
    path: string,
    method: string,
    provider: Provider = 'openai'
  ): Promise<string> {
    const prompt = `You are an API documentation expert. Explain the following API endpoint concisely:

Method: ${method}
Path: ${path}

Include: purpose, expected request/response, and one curl example.`;

    return callProvider(
      provider,
      provider === 'openai'
        ? {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 600,
          }
        : {
            model: 'claude-3-5-sonnet-latest',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 600,
          }
    );
  }

  private buildAnalysisPrompt(request: LogAnalysisRequest): string {
    const parts = [
      'Analyze the following application logs and identify the issue.',
      '',
      'LOGS:',
      request.logs.slice(-50).join('\n'),
    ];

    if (request.error) parts.push('', 'ERROR:', request.error);
    if (request.context) parts.push('', 'CONTEXT:', JSON.stringify(request.context, null, 2));

    parts.push(
      '',
      'Respond with JSON: {"summary": string, "rootCause": string, "recommendations": string[], "severity": "low"|"medium"|"high"|"critical"}'
    );

    return parts.join('\n');
  }

  private parseAIResponse(content: string): LogAnalysisResponse {
    const fallback: LogAnalysisResponse = {
      summary: content.slice(0, 300),
      recommendations: ['Review the full provider response'],
      severity: 'medium',
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return fallback;

      const parsed = JSON.parse(jsonMatch[0]);
      const severity = SEVERITIES.has(parsed.severity) ? parsed.severity : 'medium';

      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
        rootCause: typeof parsed.rootCause === 'string' ? parsed.rootCause : undefined,
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations.filter((item: unknown) => typeof item === 'string')
          : ['Review logs carefully'],
        severity,
      };
    } catch {
      logger.warn('failed to parse ai log analysis response, using raw content');
      return fallback;
    }
  }
}

export const aiLogAnalyzerService = new AILogAnalyzerService();
