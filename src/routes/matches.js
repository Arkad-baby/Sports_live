import express from 'express';
import { z } from 'zod';
import { db } from '../db/db.ts';
import { matches } from '../db/schema.ts';
import { desc, eq } from 'drizzle-orm';
import app from '../index.js';

const matchRouter = express.Router();

// Constants
const MAX_MATCHES_LIMIT = 50;

// Validation Schemas
const createMatchSchema = z.object({
  sport: z.string({
    required_error: 'Sport is required',
    invalid_type_error: 'Sport must be a string',
  }).min(1, 'Sport cannot be empty').max(100, 'Sport cannot exceed 100 characters'),
  
  homeTeam: z.string({
    required_error: 'Home team is required',
    invalid_type_error: 'Home team must be a string',
  }).min(1, 'Home team cannot be empty').max(100, 'Home team cannot exceed 100 characters'),
  
  awayTeam: z.string({
    required_error: 'Away team is required',
    invalid_type_error: 'Away team must be a string',
  }).min(1, 'Away team cannot be empty').max(100, 'Away team cannot exceed 100 characters'),
  
  status: z.enum(['scheduled', 'live', 'finished'], {
    errorMap: () => ({ message: 'Status must be one of: scheduled, live, or finished' }),
  }).default('scheduled'),
  
  startTime: z.string({
    invalid_type_error: 'Start time must be a valid datetime string',
  }).datetime('Start time must be in ISO 8601 format (e.g., 2026-02-24T20:00:00Z)').nullable().optional(),
  
  endTime: z.string({
    invalid_type_error: 'End time must be a valid datetime string',
  }).datetime('End time must be in ISO 8601 format (e.g., 2026-02-24T20:00:00Z)').nullable().optional(),
  
  homeScore: z.coerce.number({
    invalid_type_error: 'Home score must be a number',
  }).int('Home score must be an integer').min(0, 'Home score cannot be negative').default(0),
  
  awayScore: z.coerce.number({
    invalid_type_error: 'Away score must be a number',
  }).int('Away score must be an integer').min(0, 'Away score cannot be negative').default(0),
});

const updateMatchSchema = createMatchSchema.partial();

const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be a valid number'),
});

// Utility Functions
const parseMatchId = (id) => {
  const parsed = parseInt(id, 10);
  if (isNaN(parsed)) {
    throw new Error('Invalid match ID');
  }
  return parsed;
};

const formatSuccessResponse = (data, message = null) => ({
  success: true,
  ...(message && { message }),
  data,
});

const formatErrorResponse = (message, errors = null) => {
  const response = {
    success: false,
    message,
  };
  
  if (errors) {
    response.errors = errors;
  }
  
  return response;
};

const handleZodError = (res, error) => {
  
  const errorList = error.issues || error.errors || [];
  
  if (errorList.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: Invalid input data',
    });
  }

  const errors = errorList.map((err) => {
    const field = err.path && err.path.length > 0 ? err.path.join('.') : 'unknown';
    return {
      field,
      message: err.message || 'Invalid value',
      received: err.received,
      expected: err.expected,
    };
  });

  return res.status(400).json({
    success: false,
    message: `Validation failed: ${errors.map(e => `${e.field} - ${e.message}`).join(', ')}`,
    errors,
  });
};

const handleServerError = (res, error, message = 'An error occurred') => {
  console.error(`${message}:`, error);
 return res.status(500).json(
   formatErrorResponse(message)
  )
};

// Data Transformation
const prepareMatchData = (validatedData) => ({
  sport: validatedData.sport,
  homeTeam: validatedData.homeTeam,
  awayTeam: validatedData.awayTeam,
  status: validatedData.status,
  startTime: validatedData.startTime ? new Date(validatedData.startTime) : null,
  endTime: validatedData.endTime ? new Date(validatedData.endTime) : null,
  homeScore: validatedData.homeScore,
  awayScore: validatedData.awayScore,
});

const prepareUpdateData = (validatedData) => {
  const updateValues = {};
  
  const fields = ['sport', 'homeTeam', 'awayTeam', 'status', 'homeScore', 'awayScore'];
  fields.forEach((field) => {
    if (validatedData[field] !== undefined) {
      updateValues[field] = validatedData[field];
    }
  });

  if (validatedData.startTime !== undefined) {
    updateValues.startTime = validatedData.startTime ? new Date(validatedData.startTime) : null;
  }
  
  if (validatedData.endTime !== undefined) {
    updateValues.endTime = validatedData.endTime ? new Date(validatedData.endTime) : null;
  }

  return updateValues;
};

// Route Handlers
const getAllMatches = async (req, res) => {
  try {
    const allMatches = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(MAX_MATCHES_LIMIT);

    res.status(200).json(formatSuccessResponse(allMatches));
  } catch (error) {
    handleServerError(res, error, 'Failed to fetch matches');
  }
};

const getMatchById = async (req, res) => {
  try {
    const { id } = req.params;
    const matchId = parseMatchId(id);

    const match = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (match.length === 0) {
      return res.status(404).json(formatErrorResponse('Match not found'));
    }

    res.status(200).json(formatSuccessResponse(match[0]));
  } catch (error) {
    if (error.message === 'Invalid match ID') {
      return res.status(400).json(formatErrorResponse(error.message));
    }
    handleServerError(res, error, 'Failed to fetch match');
  }
};

const createMatch = async (req, res) => {
  try {
    const validatedData = createMatchSchema.parse(req.body);
    const matchData = prepareMatchData(validatedData);

    const [newMatch] = await db
      .insert(matches)
      .values(matchData)
      .returning();

    res.status(201).json(
      formatSuccessResponse(newMatch, 'Match created successfully')
    );
    if(res.app.locals.broadcastMatchCreated){
      res.app.locals.broadcastMatchCreated(newMatch)
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleZodError(res, error);
    }
    handleServerError(res, error, 'Failed to create match');
  }
};

const updateMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const matchId = parseMatchId(id);

    const validatedData = updateMatchSchema.parse(req.body);
    const updateValues = prepareUpdateData(validatedData);

    if (Object.keys(updateValues).length === 0) {
      return res.status(400).json(
        formatErrorResponse('No valid fields provided for update')
      );
    }

    const [updatedMatch] = await db
      .update(matches)
      .set(updateValues)
      .where(eq(matches.id, matchId))
      .returning();

    if (!updatedMatch) {
      return res.status(404).json(formatErrorResponse('Match not found'));
    }

    res.status(200).json(
      formatSuccessResponse(updatedMatch, 'Match updated successfully')
    );
  } catch (error) {
    if (error.message === 'Invalid match ID') {
      return res.status(400).json(formatErrorResponse(error.message));
    }
    if (error instanceof z.ZodError) {
      return handleZodError(res, error);
    }
    handleServerError(res, error, 'Failed to update match');
  }
};

// Routes
matchRouter.get('/', getAllMatches);
matchRouter.get('/:id', getMatchById);
matchRouter.post('/', createMatch);
matchRouter.put('/:id', updateMatch);


export default matchRouter;