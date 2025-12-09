const crypto = require('crypto');

const APP_PRODUCT = 'llu.android';
const APP_VERSION = '4.16.0';
const TOKEN_EXPIRY_BUFFER = 60; // seconds

let cachedToken = null;
let tokenExpire = 0;
let cachedRegion = process.env.LLU_REGION || '';
let cachedTld = process.env.LLU_TLD || 'io';
let cachedUserId = null;
let cachedPatientId = null;
let overrideCredentials = null;
let preferredUnit = 'mgdl';

const UNIT_LABELS = {
  mgdl: 'mg/dL',
  mmol: 'mmol/L',
};

function requireConfig() {
  const source = overrideCredentials || {
    email: process.env.LLU_EMAIL,
    password: process.env.LLU_PASSWORD,
    region: process.env.LLU_REGION,
    tld: process.env.LLU_TLD,
  };
  const email = source.email;
  const password = source.password;
  if (!email || !password) {
    throw new Error('LibreLinkUp credentials missing: set LLU_EMAIL and LLU_PASSWORD.');
  }
  if (source.region !== undefined && source.region !== null) {
    cachedRegion = source.region || '';
  }
  if (source.tld !== undefined && source.tld !== null) {
    cachedTld = source.tld || 'io';
  }
  if (source.unit) {
    preferredUnit = normalizeUnit(source.unit);
  }
  return { email, password };
}

function normalizeUnit(unit) {
  if (!unit) return preferredUnit || 'mgdl';
  const value = String(unit).toLowerCase();
  if (value.includes('mmol')) return 'mmol';
  if (value.includes('mg')) return 'mgdl';
  return 'mgdl';
}

function mgdlToPreferred(mgdlValue) {
  if (mgdlValue === null || mgdlValue === undefined || Number.isNaN(Number(mgdlValue))) return null;
  const numeric = Number(mgdlValue);
  if (preferredUnit === 'mmol') {
    return Number((numeric / 18).toFixed(1));
  }
  return Math.round(numeric);
}

function resolveBaseUrl(regionOverride) {
  const region = typeof regionOverride === 'string' ? regionOverride.trim() : cachedRegion.trim();
  const tld = (cachedTld || 'io').trim() || 'io';
  return region ? `https://api-${region}.libreview.${tld}` : `https://api.libreview.${tld}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function isTokenValid() {
  if (!cachedToken || !tokenExpire) return false;
  const now = Math.floor(Date.now() / 1000);
  return tokenExpire - TOKEN_EXPIRY_BUFFER > now;
}

function buildHeaders(includeAuth = true) {
  const headers = {
    product: APP_PRODUCT,
    version: APP_VERSION,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'cache-control': 'no-cache',
  };
  if (cachedUserId) {
    headers['Account-Id'] = sha256(cachedUserId);
  }
  if (includeAuth && cachedToken) {
    headers.Authorization = `Bearer ${cachedToken}`;
  }
  return headers;
}

async function parseResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`LibreLinkUp returned non-JSON response: ${text}`);
  }
}

async function acceptStep(type) {
  if (!type) throw new Error('LibreLinkUp requires acceptance but no step type was provided.');
  const url = `${resolveBaseUrl()}/auth/continue/${type}`;
  const res = await fetch(url, { method: 'POST', headers: buildHeaders(true) });
  const json = await parseResponse(res);
  if (json.status !== 0) {
    throw new Error(`LibreLinkUp acceptance failed (status ${json.status})`);
  }
}

async function login(retrying = false) {
  const { email, password } = requireConfig();
  const url = `${resolveBaseUrl()}/llu/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(false),
    body: JSON.stringify({ email, password }),
  });
  const json = await parseResponse(res);

  if (json.status === 0) {
    const ticket = json.data?.authTicket;
    if (ticket?.token) {
      cachedToken = ticket.token;
      tokenExpire = ticket.expires || 0;
    }
    if (json.data?.user?.id) {
      cachedUserId = json.data.user.id;
    }
    if (json.data?.redirect && json.data?.region && !retrying) {
      cachedRegion = json.data.region;
      return login(true);
    }
    return json;
  }

  if (json.status === 4) {
    const ticket = json.data?.authTicket;
    if (json.data?.user?.id) cachedUserId = json.data.user.id;
    if (ticket?.token) {
      const previousToken = cachedToken;
      const previousExpire = tokenExpire;
      cachedToken = ticket.token;
      tokenExpire = ticket.expires || 0;
      await acceptStep(json.data?.step?.type);
      cachedToken = previousToken;
      tokenExpire = previousExpire;
      return login(retrying);
    }
    throw new Error('LibreLinkUp requires consent before login can continue.');
  }

  throw new Error(`LibreLinkUp login failed (status ${json.status ?? 'unknown'})`);
}

async function ensureLoggedIn() {
  if (isTokenValid()) return;
  await login();
}

async function fetchConnections() {
  await ensureLoggedIn();
  const url = `${resolveBaseUrl()}/llu/connections`;
  const res = await fetch(url, { headers: buildHeaders(true) });
  const json = await parseResponse(res);

  if (json.status === 4) {
    const ticket = json.data?.authTicket;
    if (ticket?.token) {
      const previousToken = cachedToken;
      const previousExpire = tokenExpire;
      cachedToken = ticket.token;
      tokenExpire = ticket.expires || 0;
      await acceptStep(json.data?.step?.type);
      cachedToken = previousToken;
      tokenExpire = previousExpire;
      return fetchConnections();
    }
    throw new Error('LibreLinkUp requires consent to view connections.');
  }

  if (json.status !== 0) {
    throw new Error(`LibreLinkUp connections failed (status ${json.status})`);
  }

  const connections = json.data?.connections || json.data || [];
  const first = Array.isArray(connections) ? connections[0] : connections?.[0];
  const patientId = first?.patientId || first?.patient?.id || first?.id;
  if (!patientId) {
    throw new Error('LibreLinkUp patient identifier not found.');
  }
  cachedPatientId = patientId;
  return patientId;
}

async function ensurePatientId() {
  if (cachedPatientId) return cachedPatientId;
  return fetchConnections();
}

function normalizeMeasurementRaw(measurement, candidate = {}) {
  if (!measurement) return null;
  const glucoseUnits =
    measurement.GlucoseUnits ?? measurement.glucoseUnits ?? candidate.GlucoseUnits ?? candidate.glucoseUnits ?? null;
  const hasMg = measurement.ValueInMgPerDl !== undefined && measurement.ValueInMgPerDl !== null;
  const rawValue =
    measurement.Value ?? measurement.value ?? measurement.ValueInMgPerDl ?? measurement.GlucoseValue ?? measurement.glucose;

  if (hasMg && !Number.isNaN(Number(measurement.ValueInMgPerDl))) {
    return {
      mgdl: Number(measurement.ValueInMgPerDl),
      rawValue: measurement.ValueInMgPerDl,
      rawUnit: 'mg/dL',
    };
  }

  if (rawValue === undefined || rawValue === null || Number.isNaN(Number(rawValue))) {
    return null;
  }

  const numeric = Number(rawValue);
  if (glucoseUnits === 0) {
    return { mgdl: numeric * 18, rawValue: numeric, rawUnit: 'mmol/L' };
  }
  if (glucoseUnits === 1) {
    return { mgdl: numeric, rawValue: numeric, rawUnit: 'mg/dL' };
  }

  return { mgdl: numeric, rawValue: numeric, rawUnit: null };
}

function applyUnitPreference({ mgdl, trend, timestamp, raw }) {
  const value = mgdlToPreferred(mgdl);
  const unitLabel = UNIT_LABELS[preferredUnit] || 'mg/dL';

  return {
    value,
    unit: unitLabel,
    trend: trend || 'Unknown',
    timestamp: timestamp || null,
    glucose_mgdl: mgdl !== null && mgdl !== undefined ? Math.round(Number(mgdl)) : null,
    rawMgdl: mgdl !== null && mgdl !== undefined ? Number(mgdl) : null,
    raw,
  };
}

function toMgDl(value, unit) {
  if (value === undefined || value === null) return null;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return null;
  const normalizedUnit = (unit || 'mg/dL').toLowerCase();
  return normalizedUnit.includes('mmol') ? numeric * 18 : numeric;
}

function extractMeasurement(json) {
  const candidates = [json?.data?.connection, json?.data, json?.connection, json?.graph?.connection];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const measurement =
      candidate.glucoseMeasurement ||
      candidate.glucoseMeasurementHistory?.[0] ||
      candidate.glucoseMeasurements?.[0] ||
      candidate.measurements?.[0] ||
      candidate.glucoseData?.[0];
    if (measurement) {
      const normalized = normalizeMeasurementRaw(measurement, candidate);
      const trend = measurement.TrendArrow ?? measurement.trendArrow ?? measurement.Trend ?? measurement.trend ?? candidate.trend;
      const timestamp =
        measurement.Timestamp ||
        measurement.MeasurementDate ||
        measurement.TimeStamp ||
        measurement.FactoryTimestamp ||
        measurement.ReadingDate ||
        measurement.timestamp ||
        candidate.timestamp;

      if (normalized && normalized.mgdl !== null && normalized.mgdl !== undefined) {
        return applyUnitPreference({ mgdl: normalized.mgdl, trend, timestamp, raw: measurement });
      }

      const fallbackValue =
        measurement.Value ?? measurement.value ?? measurement.GlucoseValue ?? measurement.glucose ?? measurement.ValueInMgPerDl;
      const fallbackUnit =
        measurement.Unit ?? measurement.unit ?? (measurement.ValueInMgPerDl ? 'mg/dL' : candidate.unit ?? 'mg/dL');
      const mgValue = toMgDl(fallbackValue, fallbackUnit || 'mg/dL');
      if (mgValue === null || mgValue === undefined) continue;
      return applyUnitPreference({ mgdl: mgValue, trend, timestamp, raw: measurement });
    }
  }
  throw new Error('LibreLinkUp glucose measurement missing from response.');
}

function extractSeries(json) {
  const candidates = [json?.data?.connection, json?.data, json?.connection, json?.graph?.connection];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const series =
      candidate.glucoseMeasurementHistory ||
      candidate.glucoseMeasurements ||
      candidate.measurements ||
      candidate.glucoseData ||
      [];
    if (Array.isArray(series) && series.length) {
      return series
        .map((measurement) => {
          const normalized = normalizeMeasurementRaw(measurement, candidate);
          const trend = measurement.TrendArrow ?? measurement.trendArrow ?? measurement.Trend ?? measurement.trend ?? candidate.trend;
          const timestamp =
            measurement.Timestamp ||
            measurement.MeasurementDate ||
            measurement.TimeStamp ||
            measurement.FactoryTimestamp ||
            measurement.ReadingDate ||
            measurement.timestamp ||
            candidate.timestamp;

          if (normalized && normalized.mgdl !== null && normalized.mgdl !== undefined) {
            return applyUnitPreference({ mgdl: normalized.mgdl, trend, timestamp, raw: measurement });
          }

          const fallbackValue =
            measurement.Value ?? measurement.value ?? measurement.GlucoseValue ?? measurement.glucose ?? measurement.ValueInMgPerDl;
          const fallbackUnit =
            measurement.Unit ?? measurement.unit ?? (measurement.ValueInMgPerDl ? 'mg/dL' : candidate.unit ?? 'mg/dL');
          const mgValue = toMgDl(fallbackValue, fallbackUnit || 'mg/dL');
          if (mgValue === null || mgValue === undefined) return null;
          return applyUnitPreference({ mgdl: mgValue, trend, timestamp, raw: measurement });
        })
        .filter((m) => m && m.glucose_mgdl !== undefined && m.timestamp);
    }
  }
  return [];
}

async function fetchGraph() {
  const patientId = await ensurePatientId();
  await ensureLoggedIn();
  const url = `${resolveBaseUrl()}/llu/connections/${patientId}/graph`;
  const res = await fetch(url, { headers: buildHeaders(true) });
  const json = await parseResponse(res);

  if (json.status === 4) {
    const ticket = json.data?.authTicket;
    if (ticket?.token) {
      const previousToken = cachedToken;
      const previousExpire = tokenExpire;
      cachedToken = ticket.token;
      tokenExpire = ticket.expires || 0;
      await acceptStep(json.data?.step?.type);
      cachedToken = previousToken;
      tokenExpire = previousExpire;
      return fetchGraph();
    }
    throw new Error('LibreLinkUp requires consent to access glucose data.');
  }

  if (json.status !== 0) {
    throw new Error(`LibreLinkUp graph failed (status ${json.status})`);
  }

  return extractMeasurement(json);
}

async function fetchLatestReading() {
  await ensureLoggedIn();
  await ensurePatientId();
  const reading = await fetchGraph();
  return reading;
}

async function fetchGlucoseSeries() {
  const patientId = await ensurePatientId();
  await ensureLoggedIn();
  const url = `${resolveBaseUrl()}/llu/connections/${patientId}/graph`;
  const res = await fetch(url, { headers: buildHeaders(true) });
  const json = await parseResponse(res);

  if (json.status === 4) {
    const ticket = json.data?.authTicket;
    if (ticket?.token) {
      const previousToken = cachedToken;
      const previousExpire = tokenExpire;
      cachedToken = ticket.token;
      tokenExpire = ticket.expires || 0;
      await acceptStep(json.data?.step?.type);
      cachedToken = previousToken;
      tokenExpire = previousExpire;
      return fetchGlucoseSeries();
    }
    throw new Error('LibreLinkUp requires consent to access glucose data.');
  }

  if (json.status !== 0) {
    throw new Error(`LibreLinkUp graph failed (status ${json.status})`);
  }

  return extractSeries(json);
}

function setCredentials({ email, password, region, tld, unit }) {
  if (!email || !password) {
    throw new Error('Email and password are required to configure LibreLinkUp.');
  }
  overrideCredentials = {
    email,
    password,
    region: region ?? cachedRegion,
    tld: tld ?? cachedTld,
  };
  if (unit) {
    preferredUnit = normalizeUnit(unit);
  }
  cachedRegion = overrideCredentials.region || '';
  cachedTld = overrideCredentials.tld || 'io';
  cachedToken = null;
  tokenExpire = 0;
  cachedUserId = null;
  cachedPatientId = null;
}

function setPreferredUnitFromPayload(unit) {
  if (!unit) return;
  preferredUnit = normalizeUnit(unit);
}

function getPreferredUnit() {
  return preferredUnit;
}

function getPreferredUnitLabel() {
  return UNIT_LABELS[preferredUnit] || 'mg/dL';
}

function maskEmail(email) {
  if (!email) return '';
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const visible = user.slice(0, 2);
  return `${visible}***@${domain}`;
}

function getCredentialStatus() {
  const source = overrideCredentials || {
    email: process.env.LLU_EMAIL,
    password: process.env.LLU_PASSWORD,
    region: process.env.LLU_REGION,
    tld: process.env.LLU_TLD,
  };
  const hasCredentials = Boolean(source.email && source.password);
  return {
    configured: hasCredentials,
    email: maskEmail(source.email),
    region: source.region || '',
    tld: source.tld || 'io',
    source: overrideCredentials ? 'inline' : 'env',
    unit: preferredUnit,
    unit_label: getPreferredUnitLabel(),
  };
}

module.exports = {
  fetchLatestReading,
  fetchGlucoseSeries,
  resolveBaseUrl,
  buildHeaders,
  sha256,
  setCredentials,
  setPreferredUnitFromPayload,
  getCredentialStatus,
  getPreferredUnit,
  getPreferredUnitLabel,
};
