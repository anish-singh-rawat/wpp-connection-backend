'use strict';

const config = require('../config');

function randomDelay(min, max) {
  const ms = Math.floor(
    (min || config.messaging.minDelay) +
    Math.random() * ((max || config.messaging.maxDelay) - (min || config.messaging.minDelay))
  );
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toChatId(number) {
  const digits = String(number).replace(/\D/g, '');
  return `${digits}@c.us`;
}


function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

module.exports = { randomDelay, toChatId, isNonEmptyString, isNonEmptyArray };
