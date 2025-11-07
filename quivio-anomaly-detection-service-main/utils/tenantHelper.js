import data from './tenant.json' with { type: "json" };

export function getDatabaseName(subdomain) {
    const tenant = data.find(t => t.database.toLowerCase().replace(/\s+/g, '') === subdomain.toLowerCase());
    return tenant ? tenant.name : null;
}