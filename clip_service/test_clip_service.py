import requests
import os

def test_clip():
    url = "http://127.0.0.1:5000/evaluate"
    # Use existing images from the uploads folder
    gen_path = r"c:\Users\ASUS\OneDrive\Desktop\think to build\backend\uploads\generated\TEAM-417898_1777211061311.jpg"
    ref_path = r"c:\Users\ASUS\OneDrive\Desktop\think to build\backend\uploads\reference\reference.jpg"
    
    if not os.path.exists(gen_path):
        print(f"Generated image not found at {gen_path}")
        return
    if not os.path.exists(ref_path):
        print(f"Reference image not found at {ref_path}")
        return

    data = {
        "generated_image_path": gen_path,
        "reference_image_path": ref_path
    }
    
    try:
        print("Sending request to CLIP service...")
        response = requests.post(url, json=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_clip()
