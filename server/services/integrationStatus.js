/**
 * Read-only integration status for the Admin Console (ADR-029). Every value is a boolean or a fixed label derived
 * from configuration — never the configuration itself. No key, secret, address, URI or path leaves this module.
 */
const mongoose = require('mongoose');
const { activeTransport } = require('./mailer');
const { practiceTimeZone } = require('../utils/calendarTime');
const { readConfig: readUscisConfig } = require('./uscis/torchProvider');
const { readConfig: readMailConfig } = require('./mail/graph');

const MONGO_STATES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

function status(env = process.env) {
  const has = (...names) => names.every((name) => !!env[name]);
  const zone = practiceTimeZone(env);
  const uscis = readUscisConfig(env);
  const transport = activeTransport(); // 'resend' | 'smtp' | 'none' — a label, not a credential
  return {
    mongo: { status: MONGO_STATES[mongoose.connection.readyState] || 'unknown' },
    email: { configured: transport !== 'none', transport },
    googleSheets: { configured: has('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SHEET_ID') },
    uscisCaseStatus: { configured: !!(uscis.clientId && uscis.clientSecret && uscis.oauthUrl && uscis.baseUrl), enabled: uscis.enabled },
    // Shared Outlook mailbox (ADR-030): configured means all four settings are present; nothing is sent to Microsoft here.
    outlookMail: { configured: readMailConfig(env).configured },
    calendar: { practiceTimeZoneConfigured: zone.configured, practiceTimeZoneInvalid: zone.invalid },
    // What this process is configured to do; whether the separate worker process is actually running is not observable here.
    // Same test as workers/calendarReminderWorker.js isEnabled(). That module is NOT imported here on purpose: it loads
    // .env when required, which must never happen inside the web app or a test process.
    reminders: { enabled: env.CALENDAR_REMINDERS_ENABLED === 'true' },
    checkedAt: new Date(),
  };
}

module.exports = { status };
