// server/outperoService.js - Official Outpero AI Voice Integration for CarePulse
const https = require('https');
const db = require('./db');

class OutperoService {
  constructor() {
    this.apiKey = process.env.OUTPERO_API_KEY || null;
    this.agentSlug = process.env.OUTPERO_AGENT_SLUG || null;
    this.webhookSecret = process.env.OUTPERO_LEAD_SECRET || null;
  }

  isConfigured() {
    return !!(this.apiKey && this.agentSlug);
  }

  getConfigurationGuide() {
    return {
      configured: this.isConfigured(),
      endpointFormat: "POST https://outpero.com/lead-intake/{slug}",
      requiredEnvVars: [
        "OUTPERO_API_KEY",
        "OUTPERO_AGENT_SLUG",
        "OUTPERO_LEAD_SECRET"
      ],
      supportedLanguages: [
        "Telugu", "Hindi", "Tamil", "Kannada", "Malayalam", "Marathi", "English"
      ],
      instructions: "To trigger live AI voice calls, create an agent in your Outpero dashboard at https://outpero.com, obtain your Agent Slug & API Secret, and set OUTPERO_AGENT_SLUG and OUTPERO_LEAD_SECRET in your environment or server configuration."
    };
  }

  /**
   * Dispatches an outbound AI call to a patient whose queue position is approaching (Position <= 3)
   */
  async triggerTurnApproachingCall(patient, queueItem) {
    if (!patient || !patient.phone) {
      return { success: false, error: "Patient phone number is missing." };
    }

    const dbData = db.read();
    
    // Check duplicate call prevention (no more than 1 active call per token session)
    const existingCall = dbData.outperoCalls.find(c => c.tokenId === queueItem.tokenId && (c.status === 'Initiated' || c.status === 'Completed'));
    if (existingCall) {
      return {
        success: false,
        duplicatePrevented: true,
        message: `Call already dispatched for token ${queueItem.tokenId}. Duplicate prevented.`,
        callId: existingCall.id
      };
    }

    const callRecord = {
      id: "call_" + Date.now(),
      tokenId: queueItem.tokenId,
      patientId: patient.id || queueItem.patientId,
      patientName: patient.name || queueItem.patientName,
      patientPhone: patient.phone || queueItem.patientPhone,
      doctorName: queueItem.doctorName,
      speciality: queueItem.speciality,
      room: queueItem.room,
      position: queueItem.position,
      status: "Initiated",
      provider: "Outpero AI Voice Agent",
      initiatedAt: new Date().toISOString(),
      providerResponse: null
    };

    if (!this.isConfigured()) {
      // Record accurate unconfigured state without faking success
      callRecord.status = "Configuration Required";
      callRecord.providerResponse = "OUTPERO_API_KEY or OUTPERO_AGENT_SLUG not configured in server environment. Call logged in system.";
      
      dbData.outperoCalls.unshift(callRecord);
      db.write(dbData);

      return {
        success: false,
        configured: false,
        callRecord,
        error: "Outpero credentials missing. Set OUTPERO_API_KEY and OUTPERO_AGENT_SLUG in your environment."
      };
    }

    // Official Outpero Lead Intake HTTP POST
    try {
      const payload = JSON.stringify({
        phone: patient.phone.startsWith("+91") ? patient.phone : `+91${patient.phone}`,
        name: patient.name,
        token_id: queueItem.tokenId,
        doctor_name: queueItem.doctorName,
        room: queueItem.room,
        position: queueItem.position,
        clinic_name: "CarePulse MoHFW OPD"
      });

      const options = {
        hostname: 'outpero.com',
        path: `/lead-intake/${this.agentSlug}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-Outpero-Lead-Secret': this.webhookSecret || this.apiKey
        }
      };

      const result = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ statusCode: res.statusCode, body });
            } else {
              reject(new Error(`Outpero responded with HTTP ${res.statusCode}: ${body}`));
            }
          });
        });
        req.on('error', err => reject(err));
        req.write(payload);
        req.end();
      });

      callRecord.status = "Dispatched";
      callRecord.providerResponse = result;
      dbData.outperoCalls.unshift(callRecord);
      db.write(dbData);

      return { success: true, callRecord };
    } catch (err) {
      callRecord.status = "Failed";
      callRecord.providerResponse = err.message;
      dbData.outperoCalls.unshift(callRecord);
      db.write(dbData);

      return { success: false, error: err.message, callRecord };
    }
  }

  getCallHistory() {
    const data = db.read();
    return data.outperoCalls || [];
  }
}

module.exports = new OutperoService();
