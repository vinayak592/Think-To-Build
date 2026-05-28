import os
import sys

# Patching keras/tensorflow to ignore quantization_config during loading
try:
    import keras
    print("Keras version:", keras.__version__)
    
    # Let's patch keras.layers.Dense class or generic Layer class
    # Keras 3 uses Operation / Layer
    # We can patch Layer.__init__ to pop quantization_config
    if hasattr(keras.layers, 'Layer'):
        orig_init = keras.layers.Layer.__init__
        def custom_layer_init(self, *args, **kwargs):
            if 'quantization_config' in kwargs:
                print("Popping quantization_config from Layer:", self.__class__.__name__)
                kwargs.pop('quantization_config')
            orig_init(self, *args, **kwargs)
        keras.layers.Layer.__init__ = custom_layer_init

    # Let's also patch Dense.__init__ just in case
    if hasattr(keras.layers, 'Dense'):
        orig_dense_init = keras.layers.Dense.__init__
        def custom_dense_init(self, *args, **kwargs):
            if 'quantization_config' in kwargs:
                print("Popping quantization_config from Dense")
                kwargs.pop('quantization_config')
            orig_dense_init(self, *args, **kwargs)
        keras.layers.Dense.__init__ = custom_dense_init

except Exception as e:
    print("Could not patch Keras directly:", e)

# Also try patching tensorflow's keras if it's separate
try:
    import tensorflow as tf
    print("TensorFlow version:", tf.__version__)
    if hasattr(tf.keras.layers, 'Layer'):
        orig_tf_init = tf.keras.layers.Layer.__init__
        def custom_tf_layer_init(self, *args, **kwargs):
            if 'quantization_config' in kwargs:
                print("Popping quantization_config from TF Layer:", self.__class__.__name__)
                kwargs.pop('quantization_config')
            orig_tf_init(self, *args, **kwargs)
        tf.keras.layers.Layer.__init__ = custom_tf_layer_init

    if hasattr(tf.keras.layers, 'Dense'):
        orig_tf_dense_init = tf.keras.layers.Dense.__init__
        def custom_tf_dense_init(self, *args, **kwargs):
            if 'quantization_config' in kwargs:
                print("Popping quantization_config from TF Dense")
                kwargs.pop('quantization_config')
            orig_tf_dense_init(self, *args, **kwargs)
        tf.keras.layers.Dense.__init__ = custom_tf_dense_init
except Exception as e:
    print("Could not patch TensorFlow Keras:", e)

try:
    MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model', 'hibiscus_classifier.h5')
    print("Attempting to load model from:", MODEL_PATH)
    model = tf.keras.models.load_model(MODEL_PATH)
    print("Success! Model loaded successfully.")
    print(model.summary())
except Exception as e:
    print("Failed to load model:", e)
    import traceback
    traceback.print_exc()
