'use strict';

const { v4: uuidv4 } = require('uuid');
const { getSession } = require('../whatsapp/client');
const { randomDelay, toChatId } = require('../utils/helpers');
const config = require('../config');
const logger = require('../utils/logger');


class MessageQueue {
  constructor() {
    this._jobs = new Map();
    this._pending = [];
    this._processing = false;
  }


  enqueue(numbers, message, sessionName) {
    const session = sessionName || config.whatsapp.sessionName;
    const results = [];

    for (const number of numbers) {
      const chatId = toChatId(number);
      const dedupKey = `${session}:${chatId}:${message}`;

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

    this._process();

    return results;
  }

  getJob(jobId) {
    return this._jobs.get(jobId) || null;
  }

  getJobs(filter = 'all', sessionName = null) {
    let all = Array.from(this._jobs.values());
    if (sessionName) all = all.filter((j) => j.sessionName === sessionName);
    if (filter === 'all') return all;
    return all.filter((j) => j.status === filter);
  }

  _isDuplicate(dedupKey) {
    for (const job of this._jobs.values()) {
      if (job.dedupKey === dedupKey && (job.status === 'pending' || job.status === 'sending')) {
        return true;
      }
    }
    return false;
  }

  async _process() {
    if (this._processing) return; 
    this._processing = true;

    while (this._pending.length > 0) {
      const jobId = this._pending.shift();
      const job = this._jobs.get(jobId);

      if (!job || job.status !== 'pending') continue;

      await this._sendWithRetry(job);

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
          await new Promise((r) => setTimeout(r, config.messaging.retryDelay));
        }
      }
    }

    job.status = 'failed';
    job.processedAt = new Date();
    logger.error(`[Queue] ✗ Permanently failed for ${job.number} after ${job.attempts} attempts.`);
  }
}

const queue = new MessageQueue();

module.exports = queue;
