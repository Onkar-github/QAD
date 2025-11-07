// src/redisClient.js
import { createClient } from "redis";
import prisma from './prisma/client.js';
import { getRCAInsights } from "./controllers/alertController.js";
import { getDatabaseName } from "../utils/tenantHelper.js";


const redis = createClient({
  url: "redis://10.110.98.4:6379/1",  // <-- DB 1
});

redis.on("error", (err) => console.error("Redis Client Error", err));
await redis.connect();

// Subscriber client
const sub = redis.duplicate();
await sub.connect();

console.log("Connected to Redis DB 1");

// Subscribe to Celery result keys in DB 1
await sub.pSubscribe("__keyspace@1__:celery-task-meta-*", async (message, channel) => {
    if (message !== "set") return; 
    const key = channel.replace("__keyspace@1__:", "");
    const raw = await redis.get(key);
    console.log('inside redis subscriber for celery results', key, raw);
    if (!raw) return;
    
    try {
      const parsed = JSON.parse(raw);
      if (parsed.status === "SUCCESS" && parsed.result.result) {
        // get metadata you stashed earlier

        console.log("Parsed Celery result:", parsed.result);
        if(parsed.result.result.anomaly_found){
        console.log("Processing successful task:", key);
        const meta = await redis.get(`taskmeta:${parsed.task_id}`);
        const { triggerId, siteId, subdomain, siteName, triggerName,address, city,state, postal_code} = JSON.parse(meta);

        console.log("----triggerId-----", siteName, parsed.result);
  
        const anomaly = parsed.result.result;
  
        console.log("----anomaly-----", anomaly);
        // const existing = await prisma.alerts.findFirst({
        //     where: { trigger_id: triggerId, completedate: parsed.completedate },
        //   });
          
        //   if (existing) {
        //     console.log(`⚠️ Duplicate detected for task ${parsed.task_id}, skipping`);
        //     return;
        //   }

        const client = getDatabaseName(subdomain);
        console.log("----getDatabaseName-----", getDatabaseName(subdomain));

        const alert = await prisma.alerts.create({
          data: {
            trigger_id: triggerId,
            siteid: siteId || null,
            subdomain: subdomain || null,
            completedate: new Date(),
            alert_value: anomaly?.alert_value || "80",
            severity: anomaly?.severity || "Critical",
            user_id: subdomain,
            alertName: anomaly.answer.replace(/\.$/, '') + ' at ' + client + ', ' + siteName,
            analysis_dates: anomaly.date_range 
          },
        });

        const {date_range, answer} =anomaly

        const dateRange = date_range; // or maybe null / undefined

    const formatDate = (dateStr) => {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('/').map(Number);
  if (!day || !month || !year) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const [start_date, end_date] = (dateRange ?? '')
  .split('-')
  .map(s => s?.trim() || null)
  .map(formatDate);

  console.log(start_date, end_date)

        const rca = await getRCAInsights(answer, address, city, state, postal_code, start_date, end_date);
        console.log(`RCA ${JSON.stringify(rca)}`);
        await redis.set(`rcameta:${rca.task_id}`, JSON.stringify({
            alertId: alert.id,
            siteId: siteId,
            subdomain: subdomain,
            triggerName: triggerName
          }), { EX: 3600 }); // expire after 1h
        console.log(`✅ Alert created for trigger ${triggerId}`);
      
      }else if (!parsed.result.result.correlation_found) {
        console.log("Processing successful correlation task:", key);

        const anomaly = parsed.result.result;
        const meta = await redis.get(`taskmeta:${parsed.task_id}`);
        const { alertId } = JSON.parse(meta);

        prisma.alerts.update({
          where: { id: alertId },
          data: {
            news: anomaly.news_summary.news_events || "No News Found",
          },
        });
      }
      else if (parsed.result.result.correlation_found) {
    console.log("Processing successful RCA task:", key);

    const anomaly = parsed.result.result;
    const meta = await redis.get(`rcameta:${parsed.task_id}`);
    const { alertId } = JSON.parse(meta);

    await prisma.alert_rca.create({
        data: {
          alert_id: alertId,
          summary: anomaly.summary,
          root_cause: anomaly.root_cause,
          originator: 'AI',
          timeline: [
            { time: 'Mon-Sun', event: anomaly.answer || "NA" }
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

      }
    }
    } catch (err) {
      console.error("Failed to parse value for", key, err);
    }
  });
  

console.log("Listening for Celery task updates on DB 1...");

export default redis;
