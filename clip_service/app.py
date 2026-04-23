import os
from flask import Flask, request, jsonify
import torch
from transformers import CLIPProcessor, CLIPModel
from PIL import Image

app = Flask(__name__)

# Load the model and processor globally
print("Loading CLIP model...")
model_id = "openai/clip-vit-base-patch32"
model = CLIPModel.from_pretrained(model_id)
processor = CLIPProcessor.from_pretrained(model_id)
print("CLIP model loaded.")

@app.route('/evaluate', methods=['POST'])
def evaluate():
    try:
        data = request.json
        generated_image_path = data.get('generated_image_path')
        reference_image_path = data.get('reference_image_path')

        if not generated_image_path or not reference_image_path:
            return jsonify({'error': 'Missing image paths'}), 400

        if not os.path.exists(generated_image_path) or not os.path.exists(reference_image_path):
            return jsonify({'error': 'One or both image paths do not exist'}), 400

        # Load images
        gen_img = Image.open(generated_image_path).convert("RGB")
        ref_img = Image.open(reference_image_path).convert("RGB")

        # Process and get embeddings
        inputs = processor(images=[gen_img, ref_img], return_tensors="pt")
        
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)

        # Normalize features
        image_features = image_features / image_features.norm(p=2, dim=-1, keepdim=True)
        
        # Calculate cosine similarity
        gen_features = image_features[0]
        ref_features = image_features[1]
        
        similarity = torch.dot(gen_features, ref_features).item()
        
        # Score mapping (0-100)
        score = max(0.0, min(100.0, similarity * 100.0))

        return jsonify({
            'similarity_score': round(score, 2)
        })

    except Exception as e:
        print(f"Error evaluating images: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, host='127.0.0.1')


