import requests
import io
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import torch
import torch.nn.functional as F

print("Loading CLIP...")
model_id = "openai/clip-vit-base-patch32"
model = CLIPModel.from_pretrained(model_id)
processor = CLIPProcessor.from_pretrained(model_id)

def get_similarity(url1, url2):
    headers = {"User-Agent": "Mozilla/5.0"}
    img1 = Image.open(io.BytesIO(requests.get(url1, headers=headers).content)).convert("RGB")
    img2 = Image.open(io.BytesIO(requests.get(url2, headers=headers).content)).convert("RGB")
    
    inputs = processor(images=[img1, img2], return_tensors="pt")
    with torch.no_grad():
        image_features_output = model.get_image_features(**inputs)
    
    image_features = image_features_output.pooler_output if hasattr(image_features_output, "pooler_output") else image_features_output
    image_features = F.normalize(image_features, p=2, dim=1)
    similarity = torch.dot(image_features[0], image_features[1]).item()
    
    # Old logic
    old_score = max(0.0, min(100.0, similarity * 100.0))
    
    # New logic: scale from 0.2 - 1.0
    min_sim = 0.2
    max_sim = 1.0
    new_sim = (similarity - min_sim) / (max_sim - min_sim)
    new_score = max(0.0, min(100.0, new_sim * 100.0))
    
    print(f"Raw Cosine: {similarity:.4f} | Old Score: {old_score:.2f} | New Score: {new_score:.2f}")

print("Comparing Avatar 1 to Avatar 2")
get_similarity("https://avatars.githubusercontent.com/u/1", "https://avatars.githubusercontent.com/u/2")

print("Comparing Avatar 1 to Avatar 3")
get_similarity("https://avatars.githubusercontent.com/u/1", "https://avatars.githubusercontent.com/u/3")

print("Comparing Avatar 1 to itself")
get_similarity("https://avatars.githubusercontent.com/u/1", "https://avatars.githubusercontent.com/u/1")
