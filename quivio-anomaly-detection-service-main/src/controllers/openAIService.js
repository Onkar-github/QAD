export const fetchOpenAIResponse = async (prompt) => {
    try {
      console.log("Making API call...");
      
      const response = await fetch("https://soneastus2proformaai.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview", {
        method: "POST",
        headers: {
          "api-key": process.env.AZURE_OPENAI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4000,
        }),
      });
  
      console.log("Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Full error response:", errorText);
        throw new Error(`API call failed: ${response.status} - ${errorText}`);
      }
  
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Detailed error:", error);
      throw error;
    }
  }