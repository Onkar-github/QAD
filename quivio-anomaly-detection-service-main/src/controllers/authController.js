import prisma from '../prisma/client.js';
export const loginUser = async (req, res) => {
    try {
      const { user_id, password } = req.body; // assuming email+password login
  
      // 1. Check if user exists
      const user = await prisma.users.findUnique({
        where: { user_id }, // or use `id` if that’s your key
      });
  
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
  
      // 2. (Optional) Check password
      // If you store hashed passwords, compare here (e.g. bcrypt.compare)
      if (user.password !== password) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
  
      // 3. Fetch alerts specific to this user
      const alerts = await prisma.alerts.findMany({
        where: { user_id: user.user_id }, // filter by logged-in user
        include: {
          alert_rca: true,
          triggers: true,
        },
      });
  
      // 4. Return user + alerts
      res.json({ user, alerts });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to login or fetch alerts' });
    }
  };
  

  // export const refreshAlerts = async (req, res) => {
  //   const { user_id } = req.body; 
  //   try {
  //     // Fetch alerts specific to this user
  //     const alerts = await prisma.alerts.findMany({
  //       where: { user_id }, // filter by logged-in user
  //       include: {
  //         alert_rca: true,
  //         triggers: true,
  //       },
  //     });
  //     res.json({alerts });
  //   } catch (error) {
  //     console.error(error);
  //     throw new Error('Failed to fetch alerts');
  //   }
  // };

  export const refreshAlerts = async (req, res) => {
    const { user_id } = req.body;
  
    try {
      // 1️⃣ Fetch alerts for this user
      const alerts = await prisma.alerts.findMany({
        where: { user_id },
        include: {
          alert_rca: true,
          triggers: true,
        },
      });
  
      if (alerts.length === 0) {
        return res.json({ alerts: [] });
      }
  
      // 2️⃣ Prepare a batch lookup: get unique siteid + subdomain combinations
      const siteKeys = alerts.map(a => ({ siteid: a.siteid, subdomain: a.subdomain }));

    
      // 3️⃣ Fetch all matching sites in a single query
      const sites = await prisma.sites.findMany({
        where: {
          OR: siteKeys.map(sk => ({
            site_id: sk.siteid,
            subdomain: sk.subdomain,
          })),
        },
        select: {
          id: true,
          site_id: true,
          subdomain: true,
          address1: true,
          city: true,
          state: true,
          postal_code: true,
        },
      });
  
  
      // 4️⃣ Create a map for fast lookup
      const siteMap = {};
      sites.forEach(site => {
        siteMap[`${site.site_id}-${site.subdomain}`] = site;
      });

     
  
      // 5️⃣ Enrich alerts with addresses
      const enrichedAlerts = alerts.map(alert => ({
        ...alert,
        address: siteMap[`${alert.siteid}-${alert.subdomain}`]
          ? `${siteMap[`${alert.siteid}-${alert.subdomain}`].address1}, ${siteMap[`${alert.siteid}-${alert.subdomain}`].city}, ${siteMap[`${alert.siteid}-${alert.subdomain}`].state} - ${siteMap[`${alert.siteid}-${alert.subdomain}`].postal_code}`
          : null,
      }));
  
      res.json({ alerts: enrichedAlerts });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  };
  