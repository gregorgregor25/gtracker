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
let preferredUnit = 'mg/dL';

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
  if (!unit) return 'mg/dL';
  const value = String(unit).toLowerCase();
  if (value.includes('mmol')) return 'mmol/L';
  return 'mg/dL';
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
      const { value, unit } = deriveValueAndUnit(measurement, candidate);
      const trend = measurement.TrendArrow ?? measurement.trendArrow ?? measurement.Trend ?? measurement.trend ?? candidate.trend;
      const timestamp =
        measurement.Timestamp ||
        measurement.MeasurementDate ||
        measurement.TimeStamp ||
        measurement.FactoryTimestamp ||
        measurement.ReadingDate ||
        measurement.timestamp ||
        candidate.timestamp;
      return applyUnitPreference({
        value,
        unit: unit || 'mg/dL',
        trend: trend || 'Unknown',
        timestamp: timestamp || null,
        raw: measurement,
      });
    }
  }
  throw new Error('LibreLinkUp glucose measurement missing from response.');
}

function applyUnitPreference(measurement) {
  if (!measurement || measurement.value === undefined || measurement.value === null) return measurement;
  const currentUnit = (measurement.unit || 'mg/dL').toLowerCase();
  const target = preferredUnit;
  let convertedValue = measurement.value;
  if (target === 'mmol/L' && currentUnit.includes('mg')) {
    convertedValue = Number(measurement.value) / 18;
  } else if (target === 'mg/dL' && currentUnit.includes('mmol')) {
    convertedValue = Number(measurement.value) * 18;
  }
  return {
    ...measurement,
    value: Math.round(convertedValue * 10) / 10,
    unit: target,
  };
}

function deriveValueAndUnit(measurement, candidate) {
  const hasMgValue = measurement.ValueInMgPerDl !== undefined && measurement.ValueInMgPerDl !== null;
  const rawUnit = measurement.Unit ?? measurement.unit ?? candidate?.unit;
  let unit = rawUnit || (hasMgValue ? 'mg/dL' : undefined);
  let value = hasMgValue
    ? measurement.ValueInMgPerDl
    : measurement.Value ?? measurement.value ?? measurement.GlucoseValue ?? measurement.glucose;

  if (!unit && value !== undefined) {
    unit = 'mmol/L';
  }

  // If both mmol and mg values are present, prefer the explicit mg/dL figure.
  if (hasMgValue && rawUnit && String(rawUnit).toLowerCase().includes('mmol')) {
    unit = 'mg/dL';
    value = measurement.ValueInMgPerDl;
  }

  return { value, unit };
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
          const { value, unit } = deriveValueAndUnit(measurement, candidate);
          const trend = measurement.TrendArrow ?? measurement.trendArrow ?? measurement.Trend ?? measurement.trend ?? candidate.trend;
          const timestamp =
            measurement.Timestamp ||
            measurement.MeasurementDate ||
            measurement.TimeStamp ||
            measurement.FactoryTimestamp ||
            measurement.ReadingDate ||
            measurement.timestamp ||
            candidate.timestamp;
          return applyUnitPreference({
            value,
            unit: unit || 'mg/dL',
            trend: trend || 'Unknown',
            timestamp: timestamp || null,
            raw: measurement,
          });
        })
        .filter((m) => m && m.value !== undefined && m.timestamp);
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
};
