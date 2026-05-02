'use strict';

const { sendSingle, enqueueBulk, getQueueStatus, getJobById } = require('../services/messagingService');
const { parseCsvNumbers } = require('../utils/csvParser');
const { isNonEmptyString, isNonEmptyArray } = require('../utils/helpers');
const logger = require('../utils/logger');


async function sendMessage(req, res) {
  const { number, message, session } = req.body;

  if (!isNonEmptyString(number)) {
    return res.status(400).json({ success: false, error: '"number" is required and must be a non-empty string.' });
  }
  if (!isNonEmptyString(message)) {
    return res.status(400).json({ success: false, error: '"message" is required and must be a non-empty string.' });
  }

  try {
    const result = await sendSingle(number.trim(), message.trim(), session);
    return res.json({ success: true, result });
  } catch (err) {
    logger.error(`[Controller] sendMessage error: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
}


async function bulkSendMessage(req, res) {
  const { numbers, message, session } = req.body;

  if (!isNonEmptyArray(numbers)) {
    return res.status(400).json({ success: false, error: '"numbers" must be a non-empty array.' });
  }
  if (!isNonEmptyString(message)) {
    return res.status(400).json({ success: false, error: '"message" is required and must be a non-empty string.' });
  }

  const sanitised = numbers
    .map((n) => String(n).trim())
    .filter((n) => n.length > 0);

  if (sanitised.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid numbers provided.' });
  }

  const jobs = enqueueBulk(sanitised, message.trim(), session);

  return res.json({
    success: true,
    queued: jobs.filter((j) => j.status === 'queued').length,
    duplicates: jobs.filter((j) => j.status === 'duplicate').length,
    jobs,
  });
}


async function bulkSendCsv(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'CSV file is required (field name: "file").' });
  }

  const { message, session } = req.body;

  if (!isNonEmptyString(message)) {
    return res.status(400).json({ success: false, error: '"message" is required.' });
  }

  let numbers;
  try {
    numbers = await parseCsvNumbers(req.file.buffer);
  } catch (err) {
    logger.error(`[Controller] CSV parse error: ${err.message}`);
    return res.status(400).json({ success: false, error: `CSV parse error: ${err.message}` });
  }

  if (numbers.length === 0) {
    return res.status(400).json({ success: false, error: 'No numbers found in CSV.' });
  }

  const jobs = enqueueBulk(numbers, message.trim(), session);

  return res.json({
    success: true,
    parsed: numbers.length,
    queued: jobs.filter((j) => j.status === 'queued').length,
    duplicates: jobs.filter((j) => j.status === 'duplicate').length,
    jobs,
  });
}


function getQueue(req, res) {
  const { status } = req.query; // optional filter: pending | sent | failed
  const jobs = getQueueStatus(status || 'all');
  return res.json({ success: true, count: jobs.length, jobs });
}


function getQueueJob(req, res) {
  const job = getJobById(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found.' });
  }
  return res.json({ success: true, job });
}

module.exports = { sendMessage, bulkSendMessage, bulkSendCsv, getQueue, getQueueJob };
