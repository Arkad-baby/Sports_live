import express from 'express';
import { commentaryService } from '../service/commentary.js';
import {
  CreateCommentarySchema,
  UpdateCommentarySchema,
  IdParamSchema,
  MatchIdParamSchema,
} from '../validation/commentarySchema.js';
import { ZodError } from 'zod';

const router = express.Router();

/**
 * Send error response
 */
const sendError = (res, error) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  const status = error.message === 'Commentary not found' || error.message === 'Match not found' 
    ? 404 
    : 500;

  return res.status(status).json({
    success: false,
    message: error.message || 'Something went wrong',
  });
};

/**
 * POST /api/commentaries - Create commentary
 */
router.post('/', async (req, res) => {
  try {
    const data = CreateCommentarySchema.parse(req.body);
    const result = await commentaryService.create(data);

    res.status(201).json({
      success: true,
      data: result,
    });
    if(res.app.locals.broadcastCommentary && result.matchesId){
      console.log("reuslt sent",result)
      res.app.locals.broadcastCommentary(result.matchesId,result)
    }
  } catch (error) {
    sendError(res, error);
  }

});

/**
 * GET /api/commentaries/match/:matchId - Get all commentaries for a match
 * Returns empty array if no commentaries found
 */
router.get('/match/:matchId', async (req, res) => {
  try {
    const { matchId } = MatchIdParamSchema.parse(req.params);
    const results = await commentaryService.getAllByMatch(matchId);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * GET /api/commentaries/:id - Get single commentary
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const result = await commentaryService.getById(id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * PATCH /api/commentaries/:id - Update commentary
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const data = UpdateCommentarySchema.parse(req.body);
    const result = await commentaryService.update(id, data);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;