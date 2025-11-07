import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import triggerRoutes from './routes/triggerRoutes.js';
import authRoutes from './routes/authRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import plausibleRoutes from './routes/plausibleRoutes.js';
import cors from 'cors';
import cron from 'node-cron';
import prisma from './prisma/client.js';
import {  callTalkToData, getRCAInsights } from './controllers/alertController.js';
import { WebSocketServer } from "ws";
import redis from './redisClient.js';
import pkg from "pg";
import http from "http";
import { frequencyCronMap } from '../utils/cronFrequency.js';
import { backfillWeekly } from './trigger-simulation.js';
const { Client } = pkg;

const app = express();
app.use(cors());
app.use(bodyParser.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let clients = [];

console.log(process.env.DATABASE_URL,)
// Postgres connection
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
});
await pgClient.connect();

// Listen on the alerts channel
await pgClient.query("LISTEN alerts_channel");

// Forward Postgres notifications to WebSocket clients
pgClient.on("notification", async (msg) => {
  const payload = JSON.parse(msg.payload);
  console.log("DB Notification:", payload);

  let enriched = null;

  if (payload.operation === "INSERT" || payload.operation === "UPDATE") {
    // Get full alert with related tables
    enriched = await prisma.alerts.findUnique({
      where: { id: payload.row.id },
      include: {
        alert_rca: true,
        triggers: true,
      },
    });
  } else if (payload.operation === "DELETE") {
    // Deleted row → just forward what Postgres gave us
    enriched = payload.row;
  }

  const broadcastData = {
    operation: payload.operation,
    table: payload.table,
    row: enriched,
  };

  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(broadcastData));
    }
  });
});

// WebSocket connections
wss.on("connection", (ws) => {
  console.log("Client connected");
  clients.push(ws);

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
  });
});

server.listen(4000, () => {
  console.log("WebSocket server running on ws://localhost:4000");
});



// Routes
app.use('/triggers', triggerRoutes);
app.use('/alerts', alertRoutes);
app.use('/auth', authRoutes);
app.use('/plausibleRCA', plausibleRoutes);

async function detectWeeklyAnomalies(trigger) {

  const triggerName = trigger.prompt + ` for the subdomain ${trigger.subdomain} and site ID ${trigger.site_id}. Use Exact Percentage in the answer".`;

  console.log("Detecting anomalies for:", triggerName);
  const metrics = await callTalkToData(triggerName);
  console.log(trigger.triggerId)
  await redis.set(`taskmeta:${metrics.task_id}`, JSON.stringify({
    triggerId: trigger.triggerId,
    siteId: trigger.site_id,
    subdomain: trigger.subdomain,
    triggerName: trigger.triggername,
    address: trigger.address1,
    siteName: trigger.name,
    city: trigger.city,
    state:trigger.state,
    postal_code : trigger.postal_code
  }), { EX: 3600 }); // expire after 1h
  return metrics;
}

// Wrap your job logic in a function
async function runTriggersJob() {
  console.log('Running job at', new Date().toISOString());

  // const subdomains = ["bluewave", "clearwater", "papabear", "luv", "splash"];
  const subdomains = ["luv"];
  // Get 5 sites per subdomain
  const sitesPerDomain = await Promise.all(
    subdomains.map(sub =>
      prisma.sites.findMany({
        where: {
          subdomain: { contains: sub, mode: "insensitive" },
        },
        take: 1, // <-- only 5 per subdomain
      })
    )
  );
  
  // Flatten the array of arrays into a single array of sites
  const sites = sitesPerDomain.flat();

  const triggers = await prisma.triggers.findMany({
    where: { status: "Enable" },
  });
  
  // Now combine sites with triggers
  const siteTriggers = sites.flatMap(site =>
    triggers.map(trigger => ({
      ...site,
      triggerId: trigger.id,
      triggername: trigger.triggername,
      prompt: trigger.prompt
    }))
  );
  
  console.log(`Total triggers to process: ${siteTriggers}`);
  

  await Promise.all(
    siteTriggers.map(async (trigger) => {
      console.log(`Trigger executed: ${trigger.triggername} (${trigger.triggerId})`);
      const anomalies = await detectWeeklyAnomalies(trigger);

      console.log("-------------------alertName-------------------",  anomalies, anomalies.result)
      if (anomalies.anomaly_found) {
        console.log("calling RCA");
        const rca = await getRCAInsights(trigger.triggername);

        console.log("RCA detected:", rca);

        const anomaly = { ...anomalies, ...rca }; // Combine anomalies from both sources

        console.log("Combined anomaly data:", anomaly);

        const alert = await prisma.alerts.create({
          data: {
            trigger_id: trigger.id,
            siteid: trigger.siteid || null,
            subdomain: trigger.subdomain || null,
            completedate: new Date(),
            alert_value: anomaly?.alert_value || "80",
            severity: anomaly?.severity || "Critical",
            user_id: trigger.subdomain
          },
        });

        await prisma.alert_rca.create({
          data: {
            alert_id: alert.id,
            summary: anomaly.summary,
            root_cause: anomaly.root_cause,
            timeline: [
              { time: 'Mon-Sun', event: anomaly.answer }
            ],
            impacted_services: ['Car Wash Operations', 'Sales Dashboard'],
            recommended_actions: anomaly.recommended_actions,
            trends: {
              labels: ["Availabilty", "Reliability", "Efficiency", "Maintenance Score"],
              pressureData: [],
              temperatureData: [],
              flowRateData: [],
            },
            performance_metrics: {
              availability: 98,
              reliability: 97,
              efficiency: 92,
              maintenanceScore: 90,
            },
            severity: anomaly.severity || "Critical",
            estimated_downtime: 'Possible partial downtime',
            business_impact: anomaly.business_impact,
          },
        });

        console.log(`Alert created for trigger ${trigger.triggername}: ${anomaly.summary}`);

        await prisma.triggers.update({
          where: { id: trigger.triggerId },
          data: { lasttriggered: new Date() },
        });
      }
    })
  );
}

// 🔥 Run once at server start
//  runTriggersJob();
backfillWeekly()

async function scheduleTriggers() {
  const triggers = await prisma.triggers.findMany({
    where: { status: 'Enable' },
  });

  for (const trigger of triggers) {
    const cronExpr = frequencyCronMap[trigger.frequency] || frequencyCronMap.daily;

    cron.schedule(cronExpr, async () => {
      console.log(`Running ${trigger.triggername} (${trigger.frequency}) at`, new Date().toISOString());

      // You can reuse your existing site + trigger execution logic
      await runTriggersJob(trigger);
    });
  }
}

// scheduleTriggers()


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
