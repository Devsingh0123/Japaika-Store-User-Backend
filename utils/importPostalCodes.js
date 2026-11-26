import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sequelize, PostalCode, ADDRESS_COUNTRY_RULES } from '../models/index.js';

const BATCH_SIZE = 1000;

function cleanText(val, maxLen = 100) {
  if (val === null || val === undefined) return null;
  const trimmed = String(val).trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

export function normalizeRawPostalRow(raw, defaultCountry = null) {
  if (!raw || typeof raw !== 'object') return null;

  const countryRaw =
    raw.country ?? raw.countryCode ?? raw.country_code ?? defaultCountry ?? null;
  if (!countryRaw) return null;

  const country = String(countryRaw).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return null;

  const codeRaw =
    raw.postalCode ??
    raw.postal_code ??
    raw.pincode ??
    raw.pin ??
    raw.zip ??
    raw.zipcode ??
    raw.zip_code ??
    null;
  if (codeRaw === null || codeRaw === undefined) return null;

  const trimmedCode = String(codeRaw).trim();
  if (!trimmedCode) return null;

  const rule = ADDRESS_COUNTRY_RULES[country];
  if (rule && !rule.postalRegex.test(trimmedCode)) {
    return null;
  }

  const postalCode = rule ? rule.normalizeLookupCode(trimmedCode) : trimmedCode.slice(0, 20);

  const district = cleanText(
    raw.district ?? raw.districtName ?? raw.districtname ?? raw.county ?? raw.admin_name2,
    100
  );
  const city =
    cleanText(
      raw.city ??
        raw.taluk ??
        raw.subdistrict ??
        raw.place_name ??
        raw.officeName ??
        raw.officename ??
        raw.divisionname,
      100
    ) || district;
  const state = cleanText(
    raw.state ?? raw.stateName ?? raw.statename ?? raw.admin_name1,
    100
  );
  const stateCode = cleanText(
    raw.stateCode ?? raw.state_code ?? raw.admin_code1,
    10
  );

  if (!city || !state) return null;

  return {
    country,
    postalCode,
    city,
    district,
    state,
    stateCode,
  };
}

function splitDelimitedLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parsePostalDataset(content, { format = 'json', defaultCountry = null } = {}) {
  const normalizedFormat = String(format).toLowerCase();
  let rawRows = [];

  if (normalizedFormat === 'json') {
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    if (Array.isArray(parsed)) {
      rawRows = parsed;
    } else if (Array.isArray(parsed?.items)) {
      rawRows = parsed.items;
    } else if (Array.isArray(parsed?.records)) {
      rawRows = parsed.records;
    }
  } else {
    const lines = String(content)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length > 0) {
      const delimiter = normalizedFormat === 'tsv' || lines[0].includes('\t') ? '\t' : ',';
      const firstCols = splitDelimitedLine(lines[0], delimiter);
      const lowerCols = firstCols.map((c) => c.toLowerCase().replace(/[^a-z0-9_]/g, ''));

      const hasHeader = lowerCols.some((c) =>
        ['postal_code', 'postalcode', 'pincode', 'pin', 'zip', 'zipcode', 'city', 'state', 'statename'].includes(c)
      );

      if (hasHeader) {
        for (let i = 1; i < lines.length; i += 1) {
          const values = splitDelimitedLine(lines[i], delimiter);
          const obj = {};
          for (let c = 0; c < lowerCols.length; c += 1) {
            obj[lowerCols[c]] = values[c] ?? '';
          }
          rawRows.push(obj);
        }
      } else if (delimiter === '\t') {
        // Standard GeoNames TSV format: country_code, postal_code, place_name, admin_name1 (state), admin_code1 (state_code), admin_name2 (district/county)
        for (const line of lines) {
          const cols = splitDelimitedLine(line, '\t');
          rawRows.push({
            country_code: cols[0],
            postal_code: cols[1],
            place_name: cols[2],
            admin_name1: cols[3],
            admin_code1: cols[4],
            admin_name2: cols[5],
          });
        }
      }
    }
  }

  const deduped = new Map();
  let skipped = 0;

  for (const row of rawRows) {
    const normalized = normalizeRawPostalRow(row, defaultCountry);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    const key = `${normalized.country}:${normalized.postalCode}`;
    if (!deduped.has(key)) {
      deduped.set(key, {
        id: crypto.randomUUID(),
        ...normalized,
      });
    } else {
      // Fill missing district or stateCode from subsequent rows for same PIN/ZIP
      const existing = deduped.get(key);
      if (!existing.district && normalized.district) existing.district = normalized.district;
      if (!existing.stateCode && normalized.stateCode) existing.stateCode = normalized.stateCode;
    }
  }

  return {
    totalRead: rawRows.length,
    validUnique: deduped.size,
    skipped,
    records: [...deduped.values()],
  };
}

export async function importPostalRecords(records, { batchSize = BATCH_SIZE } = {}) {
  let upserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await PostalCode.bulkCreate(batch, {
      updateOnDuplicate: ['city', 'district', 'state', 'stateCode', 'updated_at'],
    });
    upserted += batch.length;
  }

  return { upserted };
}

export async function importPostalFile(filePath, { defaultCountry = null } = {}) {
  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved).toLowerCase();
  const format = ext === '.json' ? 'json' : ext === '.tsv' ? 'tsv' : 'csv';
  const content = fs.readFileSync(resolved, 'utf8');

  const parsed = parsePostalDataset(content, { format, defaultCountry });
  const { upserted } = await importPostalRecords(parsed.records);

  return {
    file: resolved,
    totalRead: parsed.totalRead,
    validUnique: parsed.validUnique,
    skipped: parsed.skipped,
    upserted,
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => !a.startsWith('--'));
  const countryFlag = args.find((a) => a.startsWith('--country='));
  const defaultCountry = countryFlag ? countryFlag.split('=')[1] : null;

  if (!fileArg) {
    console.error('Usage: node utils/importPostalCodes.js <dataset.json|dataset.csv|dataset.tsv> [--country=IN]');
    process.exit(1);
  }

  importPostalFile(fileArg, { defaultCountry })
    .then(async (summary) => {
      console.log('Postal dataset import completed:', JSON.stringify(summary, null, 2));
      await sequelize.close();
    })
    .catch(async (err) => {
      console.error('Postal dataset import failed:', err.message);
      await sequelize.close();
      process.exit(1);
    });
}
