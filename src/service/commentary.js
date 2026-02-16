import { eq, desc } from 'drizzle-orm';
import { db } from '../db/db.ts';
import { commentary, matches } from '../db/schema.ts';

export class CommentaryService {
  /**
   * Create commentary
   */
  async create(data) {
    // Check if match exists
    const [match] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.id, data.matchesId))
      .limit(1);

    if (!match) {
      throw new Error('Match not found');
    }

    const [result] = await db
      .insert(commentary)
      .values({
        matchesId: data.matchesId,
        minute: data.minute ?? null,
        sequence: data.sequence ?? null,
        period: data.period ?? null,
        eventType: data.eventType ?? null,
        actor: data.actor ?? null,
        team: data.team ?? null,
        message: data.message,
        metadata: data.metadata ?? null,
        tags: data.tags ?? null,
      })
      .returning();

    return result;
  }

  /**
   * Get all commentaries for a match, sorted by latest
   */
  async getAllByMatch(matchId) {
    const results = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchesId, matchId))
      .orderBy(desc(commentary.createdAt));

    return results;
  }

  /**
   * Get commentary by ID
   */
  async getById(id) {
    const [result] = await db
      .select()
      .from(commentary)
      .where(eq(commentary.id, id))
      .limit(1);

    if (!result) {
      throw new Error('Commentary not found');
    }

    return result;
  }

  /**
   * Update commentary
   */
  async update(id, data) {
    // Check if exists
    await this.getById(id);

    // If updating matchesId, verify match exists
    if (data.matchesId) {
      const [match] = await db
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.id, data.matchesId))
        .limit(1);

      if (!match) {
        throw new Error('Match not found');
      }
    }

    const [result] = await db
      .update(commentary)
      .set(data)
      .where(eq(commentary.id, id))
      .returning();

    return result;
  }
}

export const commentaryService = new CommentaryService();