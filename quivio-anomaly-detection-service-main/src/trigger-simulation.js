import prisma from './prisma/client.js';
import redis from './redisClient.js';
import { callTalkToData, getRCAInsights } from './controllers/alertController.js';
import {
    addDays, subMonths, isMonday, startOfWeek,
    addWeeks,
    format
} from 'date-fns';

let prevWeekStart
    let nextWeekStart
    let weekStart
export async function backfillWeekly() {
    const triggers = await prisma.triggers.findMany({
        where: { status: 'Enable', frequency: 'Weekly' },
    });

    const endDate = new Date();
    const startDate = subMonths(endDate, 6); // 6 months ago

    let currentDate = new Date(startDate);
    
    console.log("🕒 Starting weekly backfill run from", format(startDate, 'yyyy-MM-dd'), "to", format(endDate, 'yyyy-MM-dd'));

    while (currentDate <= endDate) {
        if (isMonday(currentDate)) {
            weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
            prevWeekStart = addWeeks(weekStart, -1);
            nextWeekStart = addWeeks(weekStart, 1);


            for (const trigger of triggers) {
                console.log(`Running trigger "${trigger.triggername}" for week starting ${format(weekStart, 'yyyy-MM-dd')}`);
                await runTriggersJob(trigger, currentDate);
            }
        }

        currentDate = addDays(currentDate, 1);
    }
    console.log('Weekly backfill completed.');
}




async function detectWeeklyAnomalies(trigger) {
  console.log('triggerName', trigger )
    const triggerName = trigger.prompt + ` for the subdomain ${trigger.subdomain} and site ID ${trigger.site_id}. Compare between
  Week Previous Week: ${format(prevWeekStart, 'yyyy-MM-dd')} to ${format(weekStart, 'yyyy-MM-dd')} and 
  Current Week : ${format(weekStart, 'yyyy-MM-dd')} to ${format(nextWeekStart, 'yyyy-MM-dd')}
  Use Exact Percentage in the answer.
  `;
console.log('triggerName2' )
  console.log(triggerName)

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
        state: trigger.state,
        postal_code: trigger.postal_code
    }), { EX: 3600 }); // expire after 1h
    return metrics;
}

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
                take: 5, // <-- only 5 per subdomain
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

            console.log("-------------------alertName-------------------", anomalies, anomalies.result)
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

