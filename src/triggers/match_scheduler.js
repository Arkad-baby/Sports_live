import { db } from '../db/db.js';
import { matches } from '../db/schema.js';
import { and, or, eq, lte, gte, isNotNull } from 'drizzle-orm';

export class MatchStatusScheduler {

  constructor(checkIntervalMs = 60000) {
    this.intervalId = null;
    this.isRunning = false;
    this.checkIntervalMs = checkIntervalMs;
  }

  start() {
    if (this.isRunning) {
      console.log('Match status scheduler is already running');
      return;
    }

    console.log(`Starting match status scheduler (checking every ${this.checkIntervalMs / 1000}s)`);
    
    // Run immediately on start
    this.updateMatchStatuses();
    
    // Then run at intervals
    this.intervalId = setInterval(() => {
      this.updateMatchStatuses();
    }, this.checkIntervalMs);
    
    this.isRunning = true;
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('Match status scheduler stopped');
    }
  }

  /**
   * Check and update match statuses
   */
  async updateMatchStatuses() {
    if (this.isUpdating) return;   //prevent overlapping
    this.isUpdating = true;   //lock the process
    try {
      const now = new Date();
      
      // Update scheduled -> live
      const scheduledToLive = await this.updateScheduledToLive(now);
      
      // Update live -> finished
      const liveToFinished = await this.updateLiveToFinished(now);
      
      const totalUpdated = scheduledToLive + liveToFinished;
      
      if (totalUpdated > 0) {
        console.log(`[${now.toISOString()}] Updated ${totalUpdated} match(es): ${scheduledToLive} to live, ${liveToFinished} to finished`);
      }
    } catch (error) {
      console.error('Error updating match statuses:', error);
    }
    finally{
      this.isUpdating = false;   //unlock the process
    }
  }


  async updateScheduledToLive(now) {
    try {
      const result = await db
        .update(matches)
        .set({ 
          status: 'live',
        })
        .where(
          and(
            eq(matches.status, 'scheduled'),
            isNotNull(matches.startTime),
            lte(matches.startTime, now),
          )
        )
        .returning({ id: matches.id });

      return result.length;
    } catch (error) {
      console.error('Error updating scheduled to live:', error);
      return 0;
    }
  }

  async updateLiveToFinished(now) {
    try {
      const result = await db
        .update(matches)
        .set({ 
          status: 'finished',
        })
        .where(
          and(
            eq(matches.status, 'live'),
            isNotNull(matches.endTime),
            lte(matches.endTime, now)
          )
        )
        .returning({ id: matches.id });

      return result.length;
    } catch (error) {
      console.error('Error updating live to finished:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const matchStatusScheduler = new MatchStatusScheduler();