'use strict';

const { sendSingle, enqueueBulk, enqueueBulkRecipients, getQueueStatus, getJobById } = require('../services/messagingService');
const { parseCsvNumbers, parseCsvRecipients } = require('../utils/csvParser');
const { isNonEmptyString, isNonEmptyArray } = require('../utils/helpers');
const logger = require('../utils/logger');


async function sendMessage(req, res) {
  const { number, message, link } = req.body;
  const { sessionName } = req;

  if (!isNonEmptyString(number)) {
    return res.status(400).json({ success: false, error: '"number" is required.' });
  }
  if (!isNonEmptyString(message)) {
    return res.status(400).json({ success: false, error: '"message" is required.' });
  }

  const fullMessage = link && link.trim() ? `${message.trim()}\n\n${link.trim()}` : message.trim();

  try {
    const result = await sendSingle(number.trim(), fullMessage, sessionName);
    return res.json({ success: true, result });
  } catch (err) {
    logger.error(`[Controller] sendMessage error: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
}


async function bulkSendMessage(req, res) {
  const { numbers, message, link } = req.body;
  const { sessionName } = req;

  if (!isNonEmptyArray(numbers)) {
    return res.status(400).json({ success: false, error: '"numbers" must be a non-empty array.' });
  }
  if (!isNonEmptyString(message)) {
    return res.status(400).json({ success: false, error: '"message" is required.' });
  }

  const sanitised = numbers.map((n) => String(n).trim()).filter((n) => n.length > 0);
  if (sanitised.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid numbers provided.' });
  }

  const fullMessage = link && link.trim() ? `${message.trim()}\n\n${link.trim()}` : message.trim();

  const jobs = await enqueueBulk(sanitised, fullMessage, sessionName);

  return res.json({
    success:    true,
    session:    sessionName,
    queued:     jobs.filter((j) => j.status === 'queued').length,
    duplicates: jobs.filter((j) => j.status === 'duplicate').length,
    jobs,
  });
}


async function bulkSendCsv(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'CSV file required (field: "file").' });
  }

  const fallbackMessage = isNonEmptyString(req.body.message) ? req.body.message.trim() : null;
  const link = isNonEmptyString(req.body.link) ? req.body.link.trim() : null;
  const { sessionName } = req;

  let recipients;
  try {
    recipients = await parseCsvRecipients(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ success: false, error: `CSV parse error: ${err.message}` });
  }

  if (recipients.length === 0) {
    return res.status(400).json({ success: false, error: 'No recipients found in CSV.' });
  }

  const hasCsvMessages = recipients.some((r) => r.message);
  if (!hasCsvMessages && !fallbackMessage) {
    return res.status(400).json({
      success: false,
      error:
        'No "Message" column found in CSV and no fallback "message" field provided in the request.',
    });
  }

  const fullFallbackMessage = fallbackMessage && link ? `${fallbackMessage}\n\n${link}` : fallbackMessage;

  const recipientsWithLink = link ? recipients.map((r) => ({
        ...r,
        message: r.message ? `${r.message}\n\n${link}` : undefined,
      })) : recipients;

  const jobs = await enqueueBulkRecipients(recipientsWithLink, fullFallbackMessage, sessionName);

  return res.json({
    success:    true,
    session:    sessionName,
    parsed:     recipients.length,
    queued:     jobs.filter((j) => j.status === 'queued').length,
    duplicates: jobs.filter((j) => j.status === 'duplicate').length,
    skipped:    jobs.filter((j) => j.status === 'skipped').length,
    jobs,
  });
}


async function getQueue(req, res) {
  const { sessionName } = req;
  const { status } = req.query;
  const jobs = await getQueueStatus(status || 'all', sessionName);
  return res.json({ success: true, session: sessionName, count: jobs.length, jobs });
}


async function getQueueJob(req, res) {
  const job = await getJobById(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found.' });
  }
  return res.json({ success: true, job });
}

module.exports = { sendMessage, bulkSendMessage, bulkSendCsv, getQueue, getQueueJob };
