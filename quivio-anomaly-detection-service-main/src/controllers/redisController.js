import redis from "../redisClient.js";

export async function saveTask(taskId) {
    const key = `task:${taskId}`;
    await redis.hSet(key, {
      status: "PENDING",
      createdAt: Date.now()
    });
  
    // Optional: auto-expire after 1 day
    await redis.expire(key, 86400); 
  }

  export async function updateTask(taskId, status, result = null) {
    const key = `task:${taskId}`;
    await redis.hSet(key, {
      status,
      result: result ? JSON.stringify(result) : null,
      updatedAt: Date.now()
    });
  }

 export async function getTask(taskId) {
    const key = `task:${taskId}`;
    const data = await redis.hGetAll(key);
    if (!data || Object.keys(data).length === 0) {
      return { status: "NOT_FOUND" };
    }
    return {
      taskId,
      status: data.status,
      result: data.result ? JSON.parse(data.result) : null,
      createdAt: new Date(Number(data.createdAt)),
      updatedAt: data.updatedAt ? new Date(Number(data.updatedAt)) : null
    };
  }
  