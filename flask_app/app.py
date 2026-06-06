import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

# Patch Keras/TensorFlow to ignore quantization_config during loading
try:
    import tensorflow as tf
    try:
        if hasattr(tf.keras.layers, 'Layer'):
            orig_tf_init = tf.keras.layers.Layer.__init__
            def custom_tf_layer_init(self, *args, **kwargs):
                kwargs.pop('quantization_config', None)
                orig_tf_init(self, *args, **kwargs)
            tf.keras.layers.Layer.__init__ = custom_tf_layer_init

        if hasattr(tf.keras.layers, 'Dense'):
            orig_tf_dense_init = tf.keras.layers.Dense.__init__
            def custom_tf_dense_init(self, *args, **kwargs):
                kwargs.pop('quantization_config', None)
                orig_tf_dense_init(self, *args, **kwargs)
            tf.keras.layers.Dense.__init__ = custom_tf_dense_init
    except Exception as e:
        print("[WARN] Could not patch TensorFlow Keras:", e)

    try:
        import keras
        if hasattr(keras.layers, 'Layer'):
            orig_init = keras.layers.Layer.__init__
            def custom_layer_init(self, *args, **kwargs):
                kwargs.pop('quantization_config', None)
                orig_init(self, *args, **kwargs)
            keras.layers.Layer.__init__ = custom_layer_init

        if hasattr(keras.layers, 'Dense'):
            orig_dense_init = keras.layers.Dense.__init__
            def custom_dense_init(self, *args, **kwargs):
                kwargs.pop('quantization_config', None)
                orig_dense_init(self, *args, **kwargs)
            keras.layers.Dense.__init__ = custom_dense_init
    except Exception:
        pass

    TF_AVAILABLE = True
except ImportError:
    tf = None
    TF_AVAILABLE = False
    print("[WARN] TensorFlow not available. Running in demo mode.")

app = Flask(__name__)
CORS(app)

# ===== MODEL LOADING =====
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model', 'hibiscus_classifier.h5')
model = None
DEMO_MODE = False

print(f"[INFO] Looking for model at: {MODEL_PATH}")
if not TF_AVAILABLE:
    DEMO_MODE = True
    print("[WARN] TensorFlow unavailable — running in DEMO mode (random scores).")
elif not os.path.exists(MODEL_PATH):
    DEMO_MODE = True
    print(f"[WARN] Model file not found at {MODEL_PATH}.")
    print("[WARN] Running in DEMO mode. Place hibiscus_classifier.h5 in flask_app/model/ to enable real scoring.")
else:
    try:
        print("[INFO] Loading hibiscus_classifier.h5 ...")
        model = tf.keras.models.load_model(MODEL_PATH)
        print("[INFO] Model loaded successfully. Real scoring active.")
    except Exception as e:
        DEMO_MODE = True
        print(f"[WARN] Failed to load model: {e}")
        print("[WARN] Running in DEMO mode.")


def preprocess_image(file_path):
    """Load and preprocess an image for the model."""
    img = cv2.imread(file_path)
    if img is None:
        raise ValueError(f"Could not read image: {file_path}")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (224, 224))
    img = img.astype('float32') / 255.0
    return np.expand_dims(img, axis=0)


def score_image_with_model(img_tensor):
    """Run model prediction and return a 0-100 confidence score."""
    pred = model.predict(img_tensor, verbose=0)[0][0]   # binary sigmoid output
    return float(pred) * 100.0


def demo_score(filename):
    """
    Demo mode: generate a deterministic-ish score based on filename hash
    so the same file always returns the same score during a session.
    """
    import hashlib
    h = int(hashlib.md5(filename.encode()).hexdigest(), 16)
    # Map to 20-85 range so scores look realistic
    return 20.0 + (h % 65)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'demo_mode': DEMO_MODE
    })


@app.route('/', methods=['GET'])
def index():
    return jsonify({
        'service': 'Flask Hibiscus Service',
        'status': 'running',
        'model_loaded': model is not None,
        'demo_mode': DEMO_MODE,
        'message': 'Use /predict to POST images. Place hibiscus_classifier.h5 in flask_app/model/ for real scoring.'
    })


@app.route('/predict', methods=['POST'])
def predict():
    if 'images' not in request.files:
        return jsonify({'error': 'No images uploaded'}), 400

    files = request.files.getlist('images')
    if not files:
        return jsonify({'error': 'No image files received'}), 400

    results = []

    # Ensure temporary upload directory exists
    upload_dir = os.path.join(os.path.dirname(__file__), 'uploads')
    os.makedirs(upload_dir, exist_ok=True)

    for f in files:
        filename = f.filename or f'image_{len(results)}.jpg'
        save_path = os.path.join(upload_dir, filename)
        f.save(save_path)

        try:
            if DEMO_MODE or model is None:
                # Demo mode: use deterministic hash-based score
                confidence = demo_score(filename)
                print(f"[DEMO] {filename} → {confidence:.2f}%")
            else:
                img_tensor = preprocess_image(save_path)
                confidence = score_image_with_model(img_tensor)
                print(f"[MODEL] {filename} → {confidence:.2f}%")

            # Clamp to 0-100
            confidence = max(0.0, min(100.0, confidence))
            results.append({
                'filename': filename,
                'score': round(confidence, 2)
            })
        except Exception as err:
            print(f"[ERROR] Failed to process {filename}: {err}")
            results.append({
                'filename': filename,
                'score': 0.0
            })
        finally:
            try:
                if os.path.exists(save_path):
                    os.remove(save_path)
            except Exception:
                pass

    # Determine best match (highest score)
    best = max(results, key=lambda x: x['score']) if results else None

    return jsonify({
        'results': results,
        'best': best,
        'demo_mode': DEMO_MODE
    })


if __name__ == '__main__':
    print(f"[SERVER] Flask Hibiscus Service starting on port 5000")
    print(f"[SERVER] Demo mode: {DEMO_MODE}")
    app.run(host='0.0.0.0', port=5000, debug=False)
