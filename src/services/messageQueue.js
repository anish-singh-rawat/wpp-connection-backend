'use strict';

const { v4: uuidv4 } = require('uuid');
const { getSession } = require('../whatsapp/client');
const { randomDelay, toChatId } = require('../utils/helpers');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * In-memory queue entry shape:
 * {
 *   id: string,
 *   sessionName: string,
 *   number: string,
 *   chatId: string,
 *   message: string,
 *   status: 'pending' | 'sent' | 'failed',
 *   attempts: number,
 *   error: string | null,
 *   enqueuedAt: Date,
 *   processedAt: Date | null,
 * }
 */

class MessageQueue {
  constructor() {
    /** @type {Map<string, object>} jobId → job */
    this._jobs = new Map();
    /** @type {string[]} ordered list of pending job IDs */
    this._pending = [];
    this._processing = false;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Enqueue a batch of messages.
   * Deduplicates by (sessionName + chatId + message) within the pending queue.
   *
   * @param {string[]} numbers
   * @param {string}   message
   * @param {string}   [sessionName]
   * @returns {{ jobId: string, number: string, status: string }[]}
   */
  enqueue(numbers, message, sessionName) {
    const session = sessionName || config.whatsapp.sessionName;
    const results = [];

    for (const number of numbers) {
      const chatId = toChatId(number);
      const dedupKey = `${session}:${chatId}:${message}`;

      // Check for an already-pending or in-flight duplicate
      if (this._isDuplicate(dedupKey)) {
        logger.warn(`[Queue] Duplicate skipped: ${number}`);
        results.push({ number, jobId: null, status: 'duplicate' });
        continue;
      }

      const jobId = uuidv4();
      const job = {
        id: jobId,
        dedupKey,
        sessionName: session,
        number,
        chatId,
        message,
        status: 'pending',
        attempts: 0,
        error: null,
        enqueuedAt: new Date(),
        processedAt: null,
      };

      this._jobs.set(jobId, job);
      this._pending.push(jobId);
      results.push({ number, jobId, status: 'queued' });
    }

    // Kick off processing (non-blocking)
    this._process();

    return results;
  }

  /**
   * Get the current status of a job.
   * @param {string} jobId
   */
  getJob(jobId) {
    return this._jobs.get(jobId) || null;
  }

  /**
   * Get all jobs (optionally filtered by status).
   * @param {'pending'|'sent'|'failed'|'all'} [filter]
   */
  getJobs(filter = 'all') {
    const all = Array.from(this._jobs.values());
    if (filter === 'all') return all;
    return all.filter((j) => j.status === filter);
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  _isDuplicate(dedupKey) {
    for (const job of this._jobs.values()) {
      if (job.dedupKey === dedupKey && (job.status === 'pending' || job.status === 'sending')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Sequential processor — one message at a time, with delay between each.
   */
  async _process() {
    if (this._processing) return; // already running
    this._processing = true;

    while (this._pending.length > 0) {
      const jobId = this._pending.shift();
      const job = this._jobs.get(jobId);

      if (!job || job.status !== 'pending') continue;

      await this._sendWithRetry(job);

      // Anti-ban: random delay before next message
      if (this._pending.length > 0) {
        await randomDelay();
      }
    }

    this._processing = false;
  }

  async _sendWithRetry(job) {
    const maxRetries = config.messaging.maxRetries;

    while (job.attempts <= maxRetries) {
      job.attempts += 1;
      job.status = 'sending';

      try {
        const session = getSession(job.sessionName);
        await session.sendText(job.chatId, job.message);

        job.status = 'sent';
        job.processedAt = new Date();
        logger.info(`[Queue] ✓ Sent to ${job.number} (attempt ${job.attempts})`);
        return;
      } catch (err) {
        logger.warn(
          `[Queue] ✗ Failed to send to ${job.number} (attempt ${job.attempts}): ${err.message}`
        );
        job.error = err.message;

        if (job.attempts <= maxRetries) {
          // Wait before retry
          await new Promise((r) => setTimeout(r, config.messaging.retryDelay));
        }
      }
    }

    job.status = 'failed';
    job.processedAt = new Date();
    logger.error(`[Queue] ✗ Permanently failed for ${job.number} after ${job.attempts} attempts.`);
  }
}

// Singleton queue instance
const queue = new MessageQueue();

module.exports = queue;
