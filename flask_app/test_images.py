import os
import cv2
import numpy as np
import tensorflow as tf

# Patch Keras/TensorFlow to ignore quantization_config during loading
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
    print("Could not patch TensorFlow Keras:", e)

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model', 'hibiscus_classifier.h5')
print("Loading model from:", MODEL_PATH)
model = tf.keras.models.load_model(MODEL_PATH)
print("Model loaded successfully.")

# Test image files
images = [
    r"c:\Users\ASUS\OneDrive\Desktop\think to build\backend\uploads\generated\TEAM-762650_1779598147779_216.jpg",
    r"c:\Users\ASUS\OneDrive\Desktop\think to build\backend\uploads\generated\TEAM-762650_1779598162556_982.jpg",
    r"c:\Users\ASUS\OneDrive\Desktop\think to build\backend\uploads\generated\TEAM-762650_1779600905070_78.jpg"
]

def preprocess_image(file_path):
    img = cv2.imread(file_path)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (224, 224))
    img = img.astype('float32') / 255.0
    return np.expand_dims(img, axis=0)

for img_path in images:
    if os.path.exists(img_path):
        tensor = preprocess_image(img_path)
        pred = model.predict(tensor)
        print(f"\nImage: {os.path.basename(img_path)}")
        print("Raw prediction output:", pred)
        print("Raw pred[0]:", pred[0])
    else:
        print(f"Path does not exist: {img_path}")
