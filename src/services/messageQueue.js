'use strict';

const { v4: uuidv4 } = require('uuid');
const MessageJob = require('../models/MessageJob');
const { getSession } = require('../whatsapp/client');
const { randomDelay, toChatId } = require('../utils/helpers');
const socketManager = require('./socketManager');
const config = require('../config');
const logger = require('../utils/logger');

class MessageQueue {
  constructor() {
    this._pendingIds  = []; 
    this._processing  = false;
  }

  async enqueue(numbers, message, sessionName) {
    const session = sessionName || config.whatsapp.sessionName;
    const results = [];

    for (const number of numbers) {
      const chatId   = toChatId(number);
      const dedupKey = `${session}:${chatId}:${message}`;

      if (await this._isDuplicate(dedupKey)) {
        logger.warn(`[Queue] Duplicate skipped: ${number}`);
        results.push({ number, jobId: null, status: 'duplicate' });
        continue;
      }

      const jobId = uuidv4();
      await MessageJob.create({
        _id:         jobId,
        dedupKey,
        sessionName: session,
        number,
        chatId,
        message,
        status:      'pending',
        enqueuedAt:  new Date(),
      });

      this._pendingIds.push(jobId);
      results.push({ number, jobId, status: 'queued' });
    }

    this._process();
    if (results.some((r) => r.status === 'queued')) {
      socketManager.emitQueueUpdate(session, await this.getJobs('all', session));
    }
    return results;
  }

  async enqueueRecipients(recipients, fallbackMessage, sessionName) {
    const session = sessionName || config.whatsapp.sessionName;
    const results = [];

    for (const recipient of recipients) {
      const { number } = recipient;
      const message = recipient.message || fallbackMessage;

      if (!message) {
        logger.warn(`[Queue] Skipped ${number}: no message in CSV row and no fallback provided.`);
        results.push({ number, jobId: null, status: 'skipped', reason: 'no_message' });
        continue;
      }

      const chatId   = toChatId(number);
      const dedupKey = `${session}:${chatId}:${message}`;

      if (await this._isDuplicate(dedupKey)) {
        logger.warn(`[Queue] Duplicate skipped: ${number}`);
        results.push({ number, jobId: null, status: 'duplicate' });
        continue;
      }

      const jobId = uuidv4();
      await MessageJob.create({
        _id:         jobId,
        dedupKey,
        sessionName: session,
        number,
        chatId,
        message,
        name:        recipient.name  || null,
        title:       recipient.title || null,
        city:        recipient.city  || null,
        status:      'pending',
        enqueuedAt:  new Date(),
      });

      this._pendingIds.push(jobId);
      results.push({ number, jobId, status: 'queued' });
    }

    this._process();
    if (results.some((r) => r.status === 'queued')) {
      socketManager.emitQueueUpdate(session, await this.getJobs('all', session));
    }
    return results;
  }

  async getJob(jobId) {
    const job = await MessageJob.findById(jobId).lean();
    return job ? this._toPlain(job) : null;
  }

  async getJobs(filter = 'all', sessionName = null) {
    const query = {};
    if (sessionName) query.sessionName = sessionName;
    if (filter !== 'all') query.status = filter;

    const jobs = await MessageJob.find(query).sort({ enqueuedAt: -1 }).lean();
    return jobs.map((j) => this._toPlain(j));
  }


  async recoverPendingJobs() {
    await MessageJob.updateMany(
      { status: 'sending' },
      { $set: { status: 'pending', attempts: 0 } }
    );

    const pendingJobs = await MessageJob.find({ status: 'pending' })
      .sort({ enqueuedAt: 1 })
      .select('_id')
      .lean();

    if (pendingJobs.length > 0) {
      logger.info(`[Queue] Recovering ${pendingJobs.length} pending job(s) from MongoDB...`);
      for (const j of pendingJobs) {
        this._pendingIds.push(j._id);
      }
      this._process();
    }
  }

  async _isDuplicate(dedupKey) {
    const existing = await MessageJob.findOne({
      dedupKey,
      status: { $in: ['pending', 'sending'] },
    }).lean();
    return !!existing;
  }

  async _process() {
    if (this._processing) return;
    this._processing = true;

    while (this._pendingIds.length > 0) {
      const jobId = this._pendingIds.shift();
      const job   = await MessageJob.findById(jobId);

      if (!job || job.status !== 'pending') continue;

      await this._sendWithRetry(job);

      if (this._pendingIds.length > 0) {
        await randomDelay();
      }
    }

    this._processing = false;
  }

  async _sendWithRetry(job) {
    const maxRetries = config.messaging.maxRetries;

    while (job.attempts <= maxRetries) {
      job.attempts += 1;
      job.status    = 'sending';
      await job.save();
      socketManager.emitQueueJob(job.sessionName, this._toPlain(job));

      try {
        const session = getSession(job.sessionName);
        await session.sendText(job.chatId, job.message);

        job.status      = 'sent';
        job.processedAt = new Date();
        await job.save();
        socketManager.emitQueueJob(job.sessionName, this._toPlain(job));

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

    job.status      = 'failed';
    job.processedAt = new Date();
    await job.save();
    socketManager.emitQueueJob(job.sessionName, this._toPlain(job));

    logger.error(`[Queue] ✗ Permanently failed for ${job.number} after ${job.attempts} attempts.`);
  }

  _toPlain(doc) {
    return {
      id:          doc._id,
      dedupKey:    doc.dedupKey,
      sessionName: doc.sessionName,
      number:      doc.number,
      chatId:      doc.chatId,
      message:     doc.message,
      name:        doc.name,
      title:       doc.title,
      city:        doc.city,
      status:      doc.status,
      attempts:    doc.attempts,
      error:       doc.error,
      enqueuedAt:  doc.enqueuedAt,
      processedAt: doc.processedAt,
    };
  }
}

const queue = new MessageQueue();

module.exports = queue;
