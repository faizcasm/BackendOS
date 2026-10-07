import { Router, type Request, type Response } from 'express';
import Joi from 'joi';
import { asyncHandler, ValidationError } from '../../../core/errors';
import { AIService } from './ai.service';
import { aiLogAnalyzerService } from './log-analyzer.service';

export const createAIRoutes = (aiService: AIService): Router => {
  const router = Router();

  const completionSchema = Joi.object({
    prompt: Joi.string().min(1).max(32_000).required().messages({
      'any.required': 'Prompt is required',
      'string.empty': 'Prompt must not be empty',
    }),
    provider: Joi.string().valid('openai', 'anthropic').default('openai'),
    model: Joi.string().max(100).optional(),
    temperature: Joi.number().min(0).max(2).optional(),
    maxTokens: Joi.number().integer().min(1).max(8000).optional(),
  });

  const templateSchema = Joi.object({
    variables: Joi.object().required(),
    provider: Joi.string().valid('openai', 'anthropic').default('openai'),
    model: Joi.string().max(100).optional(),
    temperature: Joi.number().min(0).max(2).optional(),
    maxTokens: Joi.number().integer().min(1).max(8000).optional(),
  });

  const validate = <T>(schema: Joi.ObjectSchema, body: unknown): T => {
    const { error, value } = schema.validate(body);
    if (error) {
      throw new ValidationError(
        'Request validation failed',
        error.details.map((d) => ({ message: d.message, path: d.path.join('.') }))
      );
    }
    return value as T;
  };

  /**
   * @route POST /api/ai/complete
   * @body   { prompt, provider?, model?, temperature?, maxTokens? }
   */
  router.post(
    '/complete',
    asyncHandler(async (req: Request, res: Response) => {
      const body = validate<{
        prompt: string;
        provider: 'openai' | 'anthropic';
        model?: string;
        temperature?: number;
        maxTokens?: number;
      }>(completionSchema, req.body);

      const completion = await aiService.generateCompletion({
        prompt: body.prompt,
        provider: body.provider,
        config: {
          model: body.model,
          temperature: body.temperature,
          maxTokens: body.maxTokens,
        },
      });

      res.json({ completion });
    })
  );

  /** @route GET /api/ai/templates */
  router.get('/templates', (_req: Request, res: Response) => {
    res.json({ templates: aiService.listPromptTemplates() });
  });

  const analyzeSchema = Joi.object({
    logs: Joi.array().items(Joi.string().max(4000)).min(1).max(200).required(),
    error: Joi.string().max(8000).optional(),
    context: Joi.object().optional(),
    provider: Joi.string().valid('openai', 'anthropic').default('openai'),
  });

  const explainSchema = Joi.object({
    path: Joi.string().max(300).required(),
    method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE').default('GET'),
    provider: Joi.string().valid('openai', 'anthropic').default('openai'),
  });

  /**
   * @route POST /api/ai/analyze-logs
   * @body   { logs: string[], error?, context?, provider? }
   * Structured incident analysis for a burst of application logs.
   */
  router.post(
    '/analyze-logs',
    asyncHandler(async (req: Request, res: Response) => {
      const body = validate<{
        logs: string[];
        error?: string;
        context?: Record<string, unknown>;
        provider: 'openai' | 'anthropic';
      }>(analyzeSchema, req.body);

      const analysis = await aiLogAnalyzerService.analyzeLogs(
        { logs: body.logs, error: body.error, context: body.context },
        body.provider
      );

      res.json({ analysis });
    })
  );

  /**
   * @route POST /api/ai/explain
   * @body   { path, method?, provider? }
   */
  router.post(
    '/explain',
    asyncHandler(async (req: Request, res: Response) => {
      const body = validate<{ path: string; method: string; provider: 'openai' | 'anthropic' }>(
        explainSchema,
        req.body
      );

      const explanation = await aiLogAnalyzerService.explainEndpoint(
        body.path,
        body.method,
        body.provider
      );

      res.json({ explanation });
    })
  );

  /**
   * @route POST /api/ai/template/:name
   * @body   { variables, provider?, model?, temperature?, maxTokens? }
   */
  router.post(
    '/template/:name',
    asyncHandler(async (req: Request, res: Response) => {
      const body = validate<{
        variables: Record<string, string>;
        provider: 'openai' | 'anthropic';
        model?: string;
        temperature?: number;
        maxTokens?: number;
      }>(templateSchema, req.body);

      const prompt = aiService.getPrompt(String(req.params.name), body.variables);
      const completion = await aiService.generateCompletion({
        prompt,
        provider: body.provider,
        config: {
          model: body.model,
          temperature: body.temperature,
          maxTokens: body.maxTokens,
        },
      });

      res.json({ prompt, completion });
    })
  );

  return router;
};
