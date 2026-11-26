import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePostalDataset } from '../../utils/importPostalCodes.js';

describe('Postal code dataset importer (parsePostalDataset)', () => {
  it('parses JSON datasets, deduplicates duplicate PIN codes, and normalizes US ZIP+4 to 5-digit lookup code', () => {
    const jsonInput = [
      {
        country: 'in',
        postalCode: '560038',
        city: 'Bengaluru',
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        stateCode: 'KA',
      },
      {
        country: 'IN',
        postalCode: '560038',
        city: 'Indiranagar S.O',
        district: 'Bengaluru Urban',
        state: 'Karnataka',
      },
      {
        country: 'US',
        postalCode: '94107-1234',
        city: 'San Francisco',
        district: 'San Francisco County',
        state: 'California',
        stateCode: 'CA',
      },
      {
        // Invalid Indian PIN (starts with 0) -> must be skipped
        country: 'IN',
        postalCode: '012345',
        city: 'Invalid',
        state: 'Invalid',
      },
    ];

    const result = parsePostalDataset(jsonInput, { format: 'json' });
    assert.equal(result.totalRead, 4);
    assert.equal(result.validUnique, 2);
    assert.equal(result.skipped, 1);

    const inRow = result.records.find((r) => r.country === 'IN');
    assert.equal(inRow.postalCode, '560038');
    assert.equal(inRow.city, 'Bengaluru');
    assert.equal(inRow.district, 'Bengaluru Urban');
    assert.equal(inRow.state, 'Karnataka');
    assert.equal(inRow.stateCode, 'KA');

    const usRow = result.records.find((r) => r.country === 'US');
    assert.equal(usRow.postalCode, '94107');
    assert.equal(usRow.city, 'San Francisco');
    assert.equal(usRow.district, 'San Francisco County');
    assert.equal(usRow.state, 'California');
    assert.equal(usRow.stateCode, 'CA');
  });

  it('parses India Post style CSV and GeoNames style TSV datasets', () => {
    const csvContent = [
      'pincode,taluk,districtname,statename',
      '110001,New Delhi,New Delhi,Delhi',
      '400050,Bandra West,Mumbai Suburban,Maharashtra',
    ].join('\n');

    const csvParsed = parsePostalDataset(csvContent, {
      format: 'csv',
      defaultCountry: 'IN',
    });
    assert.equal(csvParsed.validUnique, 2);
    assert.equal(csvParsed.records[0].country, 'IN');
    assert.equal(csvParsed.records[0].postalCode, '110001');
    assert.equal(csvParsed.records[0].city, 'New Delhi');
    assert.equal(csvParsed.records[0].district, 'New Delhi');
    assert.equal(csvParsed.records[0].state, 'Delhi');

    const tsvContent = [
      'US\t10001\tNew York\tNew York\tNY\tNew York County',
      'IN\t302001\tJaipur\tRajasthan\tRJ\tJaipur',
    ].join('\n');

    const tsvParsed = parsePostalDataset(tsvContent, { format: 'tsv' });
    assert.equal(tsvParsed.validUnique, 2);
    assert.equal(tsvParsed.records[0].country, 'US');
    assert.equal(tsvParsed.records[0].postalCode, '10001');
    assert.equal(tsvParsed.records[0].city, 'New York');
    assert.equal(tsvParsed.records[0].district, 'New York County');
    assert.equal(tsvParsed.records[0].state, 'New York');
    assert.equal(tsvParsed.records[0].stateCode, 'NY');
  });
});
