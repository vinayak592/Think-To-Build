import os
import requests
from io import BytesIO
from flask import Flask, request, jsonify
import torch
from transformers import CLIPProcessor, CLIPModel
from PIL import Image

app = Flask(__name__)

# Load the model and processor globally
model_id = "openai/clip-vit-base-patch32"
model = CLIPModel.from_pretrained(model_id)
processor = CLIPProcessor.from_pretrained(model_id)

def load_image(image_source):
    """Helper to load image from path or URL"""
    if str(image_source).startswith(('http://', 'https://')):
        response = requests.get(image_source)
        return Image.open(BytesIO(response.content)).convert("RGB")
    else:
        return Image.open(image_source).convert("RGB")

@app.route('/evaluate', methods=['POST'])
def evaluate():
    try:
        data = request.json
        gen_img_src = data.get('generated_image_path')
        ref_img_src = data.get('reference_image_path')

        if not gen_img_src or not ref_img_src:
            return jsonify({'error': 'Missing image sources'}), 400

        # Load images (could be URLs or local paths)
        gen_img = load_image(gen_img_src)
        ref_img = load_image(ref_img_src)

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
        
        # Scale score
        score = max(0.0, min(100.0, similarity * 100.0))

        return jsonify({
            'similarity_score': round(score, 2)
        })

    except Exception as e:
        print(f"Error evaluating: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Vercel handles the listener, but for local testing:
    port = int(os.environ.get('PORT', 5000))
    app.run(port=port, host='0.0.0.0')

