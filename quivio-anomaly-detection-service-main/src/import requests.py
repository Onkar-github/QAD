import requests
import json

def use_llm(raw_text, reasoning_effort):

    url = "http://10.110.98.5:80/generate"
    headers = {"x-api-key":"r8K4sn9xG2ME7tPeTtNHtoeER5iC8LXn"}

    payload = {
        "messages": [
            {"role": "user", "content": raw_text},
        ],
        "reasoning":reasoning_effort,
        "max_new_tokens":4096,
        "temperature" : 0.5
    }

    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        response_dict = response.json()
        output = response_dict["generated_text"]
        return output
    except requests.exceptions.Timeout:
        return "Request timed out. Please try again later."
    except requests.exceptions.RequestException as e:
        return f"Error communicating with LLM server: {e}"
    
reasoning_effort = "low"

# with open(r"./sample_prompt.txt", "r", encoding="UTF-8") as file:
#     prompt_t2d = repr(file.read())

response = use_llm("hi",reasoning_effort)
print(response)