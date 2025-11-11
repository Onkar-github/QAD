import prisma from '../prisma/client.js';

export const fetchPlausibleRCA = async (req, res) => {
    try {
        const plausibleRCA = await prisma.plausible_rca.findMany();
        res.json(plausibleRCA);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch Plausible RCA' });
      }
}


export const addPlausibleRCA = async (req, res) => {
    try {
        const { rootCause, description, severity, status } = req.body;

        const newPlausibleRCA = await prisma.plausible_rca.create({
          data: {
            rootCause,
            description,
            severity,
            status
          }
        });
    
        res.status(201).json(newPlausibleRCA);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create plausible RCA' });
      }
}

export const editPlausibleRCA = async (req, res) => {
    try {
        const data = req.body;
        const updatedTrigger = await prisma.plausible_rca.update({
          where: {  id: parseInt(req.params.id) },
          data
        });
    
        res.json(updatedTrigger);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update trigger' });
      }
}

export const deletePlausibleRCA = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const deletedRCA = await prisma.plausible_rca.delete({
      where: { id },
    });

    res.json({
      message: "Plausible RCA deleted successfully",
      deletedRCA,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: "RCA not found" });
    }

    res.status(500).json({ error: 'Failed to delete plausible RCA' });
  }
};
