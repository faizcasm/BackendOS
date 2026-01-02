import { Router, Request, Response } from 'express';
import { AIService } from './ai.service';

export const createAIRoutes = (aiService: AIService): Router => {
  const router = Router();

  // Generate completion
  router.post('/complete', async (req: Request, res: Response) => {
    try {
      const { prompt, provider, model, temperature, maxTokens } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const completion = await aiService.generateCompletion({
        prompt,
        provider,
        config: {
          model,
          temperature,
          maxTokens,
        },
      });

      res.json({ completion });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // List prompt templates
  router.get('/templates', (req: Request, res: Response) => {
    try {
      const templates = aiService.listPromptTemplates();
      res.json({ templates });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Generate from template
  router.post('/template/:name', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const { variables, provider, model, temperature, maxTokens } = req.body;

      if (!variables) {
        return res.status(400).json({ error: 'Variables are required' });
      }

      const prompt = aiService.getPrompt(name, variables);
      const completion = await aiService.generateCompletion({
        prompt,
        provider,
        config: {
          model,
          temperature,
          maxTokens,
        },
      });

      res.json({ prompt, completion });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
