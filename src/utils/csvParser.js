'use strict';

const { parse } = require('csv-parse');
const { Readable } = require('stream');

function parseCsvNumbers(buffer) {
  return new Promise((resolve, reject) => {
    const numbers = [];

    const parser = parse({
      trim: true,
      skip_empty_lines: true,
      columns: (header) => {
        return header.map((h) => h.toLowerCase().trim());
      },
    });

    parser.on('readable', () => {
      let record;
      while ((record = parser.read()) !== null) {
        const num =
          record.number || record.phone || record.mobile || Object.values(record)[0];
        if (num) numbers.push(String(num).trim());
      }
    });

    parser.on('error', reject);
    parser.on('end', () => resolve(numbers));

    Readable.from(buffer).pipe(parser);
  });
}


function parseCsvRecipients(buffer) {
  return new Promise((resolve, reject) => {
    const recipients = [];

    const parser = parse({
      trim: true,
      skip_empty_lines: true,
      columns: (header) => header.map((h) => h.toLowerCase().trim()),
    });

    parser.on('readable', () => {
      let record;
      while ((record = parser.read()) !== null) {
        const number =
          record.phone || record.number || record.mobile || Object.values(record)[0];
        if (!number) continue;

        recipients.push({
          number:  String(number).trim(),
          name:    record.name    || null,
          message: record.message || null,
          title:   record.title   || null,
          city:    record.city    || null,
        });
      }
    });

    parser.on('error', reject);
    parser.on('end', () => resolve(recipients));

    Readable.from(buffer).pipe(parser);
  });
}

module.exports = { parseCsvNumbers, parseCsvRecipients };
