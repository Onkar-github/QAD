import prisma from '../prisma/client.js';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

import { fetchOpenAIResponse } from './openAIService.js';

// GET all triggers
export const getTriggers = async (req, res) => {
  try {
    const triggers = await prisma.triggers.findMany();
    res.json(triggers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch triggers' });
  }
};

// POST create a trigger
export const createTrigger = async (req, res) => {
  try {
    const { triggername, prompt, tag, frequency, lasttriggered } = req.body;
    const id = uuidv4();
    
    // const promptoverview = await fetchOpenAIResponse(
    //   "You are an AI assistant that helps give a one-two liner summary of the trigger without pointers and in simple sentneces. Give an overview based on the provided prompt with possible cause of it. Give one or two description of the trigger: "
    // + ` ${prompt}`
    // )

    const promptoverview = `Can't generate overview at the moment.` ;

    console.log("OpenAI response:", promptoverview);
    const newTrigger = await prisma.triggers.create({
      data: {
        id,
        triggername,
        prompt,
        tag,
        frequency,
        lasttriggered,
        promptoverview,
      }
    });

    res.status(201).json(newTrigger);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create trigger' });
  }
};

// PATCH /triggers/:id
export const editTrigger = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const updatedTrigger = await prisma.triggers.update({
      where: { id },
      data
    });

    res.json(updatedTrigger);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update trigger' });
  }
}

export const deleteTrigger = async (req, res) => {
  try {
    const { id } = req.params;

    if(id && !uuidValidate(id)){
      return res.status(400).json({ error: "Invalid trigger id UUID format" });
    }

    const deletedTrigger = await prisma.triggers.delete({
      where: { id },
    }); 
    
    res.json({
      message: "Trigger deleted successfully",
      deletedTrigger,
    });
  } catch (error) {
    if(error.code === 'P2025') {
      return res.status(404).json({ error: "Trigger not found" });
    }
    
    res.status(500).json({ error: 'Failed to delete trigger' });
  }
};