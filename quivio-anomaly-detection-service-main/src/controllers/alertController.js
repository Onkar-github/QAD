import prisma from '../prisma/client.js';
import axios from 'axios';
import { Pool } from 'pg';
import { validate as uuidValidate } from "uuid";

const TALK_TO_DATA = 'http://10.110.98.4:8002/api/v1/submit/anomaly'; // your backend API



// PostgreSQL connection pool for the other database
const pool = new Pool({
  connectionString: process.env.OTHER_DATABASE_URL, // set your other DB URL in .env
  ssl: { rejectUnauthorized: false } 
});


export const getAlerts = async (req, res) => {
  try {
    const alerts = await prisma.alerts.findMany({
      include: {
        alert_rca: true,
        triggers: true
      }
    });
    res.json(alerts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
};


export const callTalkToData = async (query) => {
  const res = await axios.post(TALK_TO_DATA, {
    "tenant_id": "t2",
    "username": "default",
    "password": "password123",
    "query": query + '.Use Exact Percentage in the answer'
  });
  return res.data;
};


const API_URL = 'http://10.110.98.4:8002/api/v1/submit/analyze'; // your backend API

// GET all triggers
export const getRCAInsights = async (query, address, city, state, postal_code, start_date, end_date) => {
  const res = await axios.post(API_URL, {
    "site_address": address + ", " + city + ", " + state + " " + postal_code,
    "anomaly": query,
    "start_date": start_date,
    "end_date": end_date
  });
  return res.data;
};


export const getTrends = async (req, res) => {
  try {
    const { subdomain, siteid } = req.body;
    if (!subdomain || !siteid) {
      return res.status(400).json({ error: "Missing subdomain or siteid" });
    }

    const siteIdNum = Number(siteid);

    const queries = {
      weekly: `
        SELECT completedate::date AS date, SUM(netcarcount)::int AS netcarcount
        FROM coresalesmetrics
        WHERE subdomain = $1 AND siteid = $2 AND completedate >= NOW() - INTERVAL '7 days'
        GROUP BY date ORDER BY date ASC;
      `,
      monthly: `
        SELECT completedate::date AS date, SUM(netcarcount)::int AS netcarcount
        FROM coresalesmetrics
        WHERE subdomain = $1 AND siteid = $2 AND completedate >= NOW() - INTERVAL '30 days'
        GROUP BY date ORDER BY date ASC;
      `,
      yearly: `
        SELECT completedate::date AS date, SUM(netcarcount)::int AS netcarcount
        FROM coresalesmetrics
        WHERE subdomain = $1 AND siteid = $2 AND completedate >= NOW() - INTERVAL '365 days'
        GROUP BY date ORDER BY date ASC;
      `
    };

    const [weekly, monthly, yearly] = await Promise.all([
      pool.query(queries.weekly, [subdomain, siteIdNum]).then(r => r.rows),
      pool.query(queries.monthly, [subdomain, siteIdNum]).then(r => r.rows),
      pool.query(queries.yearly, [subdomain, siteIdNum]).then(r => r.rows),
    ]);

    res.json({ weekly, monthly, yearly });
  } catch (error) {
    console.error("Error fetching trends:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};


export const addManualRCA = async (req, res) => {
  try {
    const { alert_id, rca, rca_type } = req.body;

    if (!alert_id || !rca || !rca_type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newRCA = await prisma.alert_rca.create({
      data: {
        alert_id,
        summary: rca,
        root_cause: rca_type,
        originator: 'Human',
      }
    });

    res.status(201).json(newRCA);
  } catch (error) {
    console.error("Error adding manual RCA:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

export const getStateHistory = async (req, res) => {
  try {
    const { alert_id } = req.query;

    if (alert_id && !uuidValidate(alert_id)) {
      return res.status(400).json({ error: "Invalid alert_id UUID format" });
    }

    let history;

    if (alert_id) {
      history = await prisma.alert_state_log.findMany({
        where: { alert_id },
        orderBy: { created_at: "desc" }
      });

    } else {
      history = await prisma.alert_state_log.findMany({
        orderBy: { created_at: "desc" }
      });
    }
    if (history.length === 0) {
      return res.status(404).json({
        success: false,
        message: alert_id ? `No state history found for alert_id: ${alert_id}` : "No alert state history found"
      });
    }
    return res.json(history);
  } catch (error) {
    return res.status(500).json({
      error: "Internal server error",
      details: error.message || "Unknown Error"
    });
  }
};

export const addStateHistory = async (req, res) => {
  try {
    const { alert_id, current_state, comment } = req.body;

    if (!alert_id || !current_state) {
      return res.status(400).json({ error: "Missing required fields: alert_id, current_state" });
    }

    if (alert_id && !uuidValidate(alert_id)) {
      return res.status(400).json({ error: "Invalid alert_id UUID format" });
    }

    const lastState = await prisma.alert_state_log.findFirst({
      where: { alert_id },
      orderBy: { created_at: "desc" }
    });

    const previous_state = lastState ? lastState.current_state : null;

    const newStateLog = await prisma.alert_state_log.create({
      data: {
        alert_id,
        previous_state,
        current_state,
        comment: comment || null
      }
    });

    res.status(201).json(newStateLog);
  } catch (error) {
    res.status(500).json({ error: "Internal server error", details: error.message || "Unknown Error" });
  }
};