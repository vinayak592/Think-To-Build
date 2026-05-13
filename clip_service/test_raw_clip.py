import torch
from transformers import CLIPProcessor, CLIPModel
from PIL import Image
import torch.nn.functional as F
import numpy as np

model_id = "openai/clip-vit-base-patch32"
model = CLIPModel.from_pretrained(model_id)
processor = CLIPProcessor.from_pretrained(model_id)

# Create two different random noise images
img1 = Image.fromarray(np.random.randint(0, 256, (224, 224, 3), dtype=np.uint8))
img2 = Image.fromarray(np.random.randint(0, 256, (224, 224, 3), dtype=np.uint8))
img3 = img1.copy()

inputs = processor(images=[img1, img2, img3], return_tensors="pt")

with torch.no_grad():
    image_features = model.get_image_features(**inputs)

image_features = F.normalize(image_features, p=2, dim=1)

sim_different = torch.dot(image_features[0], image_features[1]).item()
sim_identical = torch.dot(image_features[0], image_features[2]).item()

print(f"Raw Cosine Similarity (Random vs Random): {sim_different}")
print(f"Raw Cosine Similarity (Identical): {sim_identical}")
