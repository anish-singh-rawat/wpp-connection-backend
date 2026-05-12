'use strict';

const { getSession } = require('../whatsapp/client');
const queue = require('./messageQueue');
const { toChatId } = require('../utils/helpers');
const logger = require('../utils/logger');

async function sendSingle(number, message, sessionName) {
  const session = getSession(sessionName);
  const chatId = toChatId(number);

  logger.info(`[Messaging] Sending single message to ${number}`);
  await session.sendText(chatId, message);
  logger.info(`[Messaging] ✓ Sent to ${number}`);

  return { number, status: 'sent' };
}

function enqueueBulk(numbers, message, sessionName) {
  logger.info(`[Messaging] Enqueueing ${numbers.length} messages`);
  return queue.enqueue(numbers, message, sessionName);
}

function getQueueStatus(filter, sessionName) {
  return queue.getJobs(filter, sessionName);
}

function getJobById(jobId) {
  return queue.getJob(jobId);
}

module.exports = { sendSingle, enqueueBulk, getQueueStatus, getJobById };