from .youtube import get_yt_transcript_cleaned
import ollama
import re
import json
import json5

SYSTEM = """
You are a recipe-parsing assistant.  Whenever I send you a chunk of cooking-video transcript, you MUST output valid JSON with exactly these keys:

{
"title":        string or null,
"ingredients":  [ { "name": string, "amount": string }, … ],
"instructions": [ string, … ]
}

Do NOT output any extra text or markdown—only the JSON object.
""".strip()

def _chunk_texts(raw_text: str, chunk_size: int = 120_000_000):
    """
    Break up the entire transcript into smaller chunks to not overwhelm the model.
    Default chunk size is 120_000_000 chars (avoid scratching too close on the 128k limit)
    """
    sentences = re.split(r'(?<=[.!?])\s+', raw_text)
    chunks, current = [], ""
    for s in sentences:
        if len(current) + len(s) + 1 > chunk_size:
            chunks.append(current.strip())
            current = s
        else:
            current += " " + s
    if current:
        chunks.append(current.strip())
    return chunks

def extract_recipe_via_ollama(transcript: str, model: str):
    
    messages = [
        {"role": "system",  "content": SYSTEM}
    ]

    all_ings = []
    all_steps = []
    title    = None

    for idx, chunk in enumerate(_chunk_texts(transcript)):
        # append chunk
        messages.append({
            "role":    "user",
            "content": f"TRANSCRIPT CHUNK {idx+1}:\n{chunk}"
        })

        # call ollama
        resp = ollama.chat(model=model, messages=messages)
        reply = resp.message.content

        # parse the JSON back into Python
        try:
            data = json5.loads(reply)
        except:
            raise ValueError(f"Invalid JSON from Ollama:\n{reply}")

        # merge results
        if not title and data.get("title"):
            title = data["title"]

        for ing in data.get("ingredients", []):
            if ing not in all_ings:
                all_ings.append(ing)

        for step in data.get("instructions", []):
            all_steps.append(step)

        # push reply into history so it stays in context
        messages.append({
            "role":    "assistant",
            "content": reply
        })

    return {
        "title":        title or None,
        "ingredients":  all_ings,
        "instructions": all_steps
    }