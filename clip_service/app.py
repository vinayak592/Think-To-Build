import io
import torch
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import torch.nn.functional as F

app = FastAPI(title="CLIP Image Similarity Service")

# Load the model and processor globally
print("Loading CLIP model (ViT-B/32)...")
model_id = "openai/clip-vit-base-patch32"
model = CLIPModel.from_pretrained(model_id)
processor = CLIPProcessor.from_pretrained(model_id)
print("CLIP model loaded successfully.")


def compute_similarity(image1: Image.Image, image2: Image.Image) -> float:
    """Compute cosine similarity between two images using CLIP embeddings."""
    inputs = processor(images=[image1, image2], return_tensors="pt")

    with torch.no_grad():
        image_features_output = model.get_image_features(**inputs)

    # Extract the tensor from the output object
    if hasattr(image_features_output, "pooler_output"):
        image_features = image_features_output.pooler_output
    else:
        image_features = image_features_output

    # Normalize embeddings
    image_features = F.normalize(image_features, p=2, dim=1)

    # Cosine similarity between the two normalized vectors
    similarity = torch.dot(image_features[0], image_features[1]).item()

    # Normalize to 0-100 scale (direct percentage of cosine similarity)
    # The original implementation did similarity * 100
    score = max(0.0, min(100.0, similarity * 100.0))
    return round(score, 2)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "model": model_id}


@app.post("/compare")
async def compare(
    img1: UploadFile = File(..., description="Target/reference image"),
    img2: UploadFile = File(..., description="Participant image"),
):
    """
    Compare two images using CLIP and return a similarity score (0-100).
    img1 = target image (uploaded by admin)
    img2 = participant image
    """
    try:
        # Read uploaded files into PIL Images
        img1_bytes = await img1.read()
        img2_bytes = await img2.read()

        if not img1_bytes or not img2_bytes:
            raise HTTPException(status_code=400, detail="Both images are required and must not be empty.")

        image1 = Image.open(io.BytesIO(img1_bytes)).convert("RGB")
        image2 = Image.open(io.BytesIO(img2_bytes)).convert("RGB")

        score = compute_similarity(image1, image2)
        print(f"Similarity score: {score}")

        return {"score": score}

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Image comparison failed: {str(e)}")


@app.post("/evaluate")
async def evaluate_legacy(
    img1: UploadFile = File(None),
    img2: UploadFile = File(None),
):
    """
    Legacy backward-compatible endpoint.
    Accepts multipart files and redirects to /compare logic.
    """
    if img1 and img2:
        return await compare(img1, img2)

    return JSONResponse(
        status_code=400,
        content={"error": "This endpoint now requires multipart file uploads (img1, img2)."}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5000)
