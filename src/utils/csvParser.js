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

module.exports = { parseCsvNumbers };
