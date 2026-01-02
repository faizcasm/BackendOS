import axios from 'axios';
import { config } from '../../../core/config';
import { logger } from '../../../core/logger';

export interface LogAnalysisRequest {
  logs: string[];
  error?: string;
  context?: Record<string, any>;
}

export interface LogAnalysisResponse {
  summary: string;
  rootCause?: string;
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class AILogAnalyzerService {
  async analyzeLogs(request: LogAnalysisRequest): Promise<LogAnalysisResponse> {
    if (!config.ai.openaiKey && !config.ai.anthropicKey) {
      throw new Error('AI service not configured');
    }

    const prompt = this.buildAnalysisPrompt(request);

    try {
      if (config.ai.openaiKey) {
        return await this.analyzeWithOpenAI(prompt);
      } else if (config.ai.anthropicKey) {
        return await this.analyzeWithAnthropic(prompt);
      }
      throw new Error('No AI service available');
    } catch (error: any) {
      logger.error('AI log analysis failed', { error: error.message });
      throw new Error('Log analysis failed');
    }
  }

  private buildAnalysisPrompt(request: LogAnalysisRequest): string {
    let prompt = `You are an expert backend engineer analyzing application logs to identify issues and provide solutions.

Analyze the following logs and error information:

LOGS:
${request.logs.slice(-50).join('\n')}

`;

    if (request.error) {
      prompt += `\nERROR MESSAGE:\n${request.error}\n`;
    }

    if (request.context) {
      prompt += `\nCONTEXT:\n${JSON.stringify(request.context, null, 2)}\n`;
    }

    prompt += `\nProvide:
1. A brief summary of what's happening
2. The root cause of the issue (if identifiable)
3. Specific recommendations to fix the problem
4. Severity assessment (low/medium/high/critical)

Format your response as JSON with keys: summary, rootCause, recommendations (array), severity`;

    return prompt;
  }

  private async analyzeWithOpenAI(prompt: string): Promise<LogAnalysisResponse> {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert backend engineer specializing in log analysis and troubleshooting.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.ai.openaiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data.choices[0].message.content;
    return this.parseAIResponse(content);
  }

  private async analyzeWithAnthropic(prompt: string): Promise<LogAnalysisResponse> {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-sonnet-20240229',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      },
      {
        headers: {
          'x-api-key': config.ai.anthropicKey!,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data.content[0].text;
    return this.parseAIResponse(content);
  }

  private parseAIResponse(content: string): LogAnalysisResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || 'Analysis completed',
          rootCause: parsed.rootCause,
          recommendations: Array.isArray(parsed.recommendations)
            ? parsed.recommendations
            : [parsed.recommendations || 'Review logs carefully'],
          severity: parsed.severity || 'medium',
        };
      }

      // Fallback parsing
      return {
        summary: content.substring(0, 200),
        recommendations: ['Review the detailed analysis above'],
        severity: 'medium',
      };
    } catch (error) {
      logger.warn('Failed to parse AI response, using raw content');
      return {
        summary: content,
        recommendations: ['Manual review recommended'],
        severity: 'medium',
      };
    }
  }

  async explainEndpoint(path: string, method: string): Promise<string> {
    if (!config.ai.openaiKey && !config.ai.anthropicKey) {
      throw new Error('AI service not configured');
    }

    const prompt = `You are an API documentation expert. Explain the following API endpoint in a clear, concise way:

Method: ${method}
Path: ${path}

Provide:
1. What this endpoint does
2. Expected request format (if applicable)
3. Expected response format
4. A curl example

Keep it practical and focused on helping developers use the API.`;

    try {
      if (config.ai.openaiKey) {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 500,
          },
          {
            headers: {
              'Authorization': `Bearer ${config.ai.openaiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        return response.data.choices[0].message.content;
      }

      throw new Error('OpenAI not configured');
    } catch (error: any) {
      logger.error('API explanation failed', { error: error.message });
      throw new Error('Explanation generation failed');
    }
  }
}

export const aiLogAnalyzerService = new AILogAnalyzerService();
