import os
import io
import base64
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS

# Suppress noisy TensorFlow logs and disable heavy oneDNN buffers on low-memory servers
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
import tensorflow as tf
from tensorflow import keras

# Limit CPU thread pools to prevent CPU contention on cloud instances
try:
    tf.config.threading.set_intra_op_parallelism_threads(1)
    tf.config.threading.set_inter_op_parallelism_threads(1)
except Exception:
    pass

app = Flask(__name__)
CORS(app)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "my_model.keras")
print(f"Loading model from {MODEL_PATH}...")
try:
    model = keras.models.load_model(MODEL_PATH)
    print("Model loaded successfully!")
    print("Input shape:", model.input_shape)
    print("Output shape:", model.output_shape)
    
    # Pre-compile computation graph once during boot so user requests don't hit 30s timeout
    dummy_input = np.zeros((1, 28, 28, 1), dtype=np.float32)
    _ = model(dummy_input, training=False)
    print("Model warmup complete! Ready for low-latency inference.")
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

def preprocess_digit_image(pil_img, mode="center"):
    """
    Preprocess image to MNIST standards:
    - Grayscale
    - Background is black (0), stroke is white (~255)
    - Mode 'center': crop to digit bounding box, fit in 20x20, pad to 28x28, center of mass
    - Mode 'direct': direct resize to 28x28 as in notebook's DigitDrawer
    """
    # Convert RGBA / RGB to Grayscale
    if pil_img.mode in ("RGBA", "LA"):
        # Composite onto solid black background
        bg = Image.new("RGBA", pil_img.size, (0, 0, 0, 255))
        bg.paste(pil_img, mask=pil_img.split()[-1]) # use alpha mask
        img = bg.convert("L")
    else:
        img = pil_img.convert("L")

    arr = np.array(img, dtype=np.float32)

    # Invert if user drew black on white
    corners = [arr[0, 0], arr[0, -1], arr[-1, 0], arr[-1, -1]]
    if np.mean(corners) > 128 or np.mean(arr) > 127:
        arr = 255.0 - arr
        img = Image.fromarray(arr.astype(np.uint8))

    if mode == "center":
        # Find non-blank pixels (threshold > 15)
        coords = np.argwhere(arr > 15)
        if len(coords) > 0:
            y_min, x_min = coords.min(axis=0)
            y_max, x_max = coords.max(axis=0)
            w = x_max - x_min + 1
            h = y_max - y_min + 1

            if w > 4 and h > 4:
                cropped = img.crop((x_min, y_min, x_max + 1, y_max + 1))
                scale = 20.0 / max(w, h)
                new_w = max(1, int(round(w * scale)))
                new_h = max(1, int(round(h * scale)))
                resized_crop = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)

                # Paste in center of 28x28 canvas
                centered = Image.new("L", (28, 28), 0)
                paste_x = (28 - new_w) // 2
                paste_y = (28 - new_h) // 2
                centered.paste(resized_crop, (paste_x, paste_y))

                # Center of mass shift to (14, 14)
                c_arr = np.array(centered, dtype=np.float32)
                mass = np.sum(c_arr)
                if mass > 0:
                    y_idx, x_idx = np.indices((28, 28))
                    cy = np.sum(y_idx * c_arr) / mass
                    cx = np.sum(x_idx * c_arr) / mass
                    shift_x = int(round(14 - cx))
                    shift_y = int(round(14 - cy))
                    if abs(shift_x) <= 4 and abs(shift_y) <= 4 and (shift_x != 0 or shift_y != 0):
                        shifted = Image.new("L", (28, 28), 0)
                        shifted.paste(centered, (shift_x, shift_y))
                        centered = shifted

                return centered

    # Direct resize fallback
    return img.resize((28, 28), Image.Resampling.LANCZOS)

def pil_to_base64(img):
    buffered = io.BytesIO()
    # Save as PNG
    img.save(buffered, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffered.getvalue()).decode("utf-8")

@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "message": "Digit Recognition CNN Model API is running!",
        "health": "/api/health",
        "predict": "/api/predict"
    })

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "online",
        "model_loaded": model is not None,
        "input_shape": list(model.input_shape) if model else None
    })

@app.route("/api/predict", methods=["POST"])
def predict():
    if model is None:
        return jsonify({"error": "Model is not loaded."}), 500

    data = request.get_json(force=True)
    if not data or "image" not in data:
        return jsonify({"error": "No image data provided in request body."}), 400

    img_data = data["image"]
    mode = data.get("mode", "center")  # "center" or "direct"

    # Decode base64
    if "," in img_data:
        img_data = img_data.split(",")[1]

    try:
        raw_bytes = base64.b64decode(img_data)
        pil_image = Image.open(io.BytesIO(raw_bytes))
    except Exception as e:
        return jsonify({"error": f"Invalid image format: {str(e)}"}), 400

    # Preprocess
    processed_28x28 = preprocess_digit_image(pil_image, mode=mode)
    
    # Check if canvas was completely empty
    arr_28 = np.array(processed_28x28, dtype=np.float32)
    if np.max(arr_28) < 10:
        return jsonify({
            "empty": True,
            "message": "Canvas appears empty. Please draw a digit before predicting."
        })

    # Normalize to [0.0, 1.0]
    norm_arr = arr_28 / 255.0
    model_input = norm_arr.reshape(1, 28, 28, 1)

    # Predict
    raw_probs = model(model_input, training=False).numpy()[0]
    probabilities = [float(p) for p in raw_probs]
    predicted_digit = int(np.argmax(probabilities))
    confidence = float(probabilities[predicted_digit]) * 100

    # Top 3
    top3_indices = [int(i) for i in np.argsort(probabilities)[::-1][:3]]
    top3 = [
        {"digit": idx, "probability": probabilities[idx] * 100}
        for idx in top3_indices
    ]

    # Generate preview base64
    preview_url = pil_to_base64(processed_28x28)

    return jsonify({
        "digit": predicted_digit,
        "confidence": round(confidence, 2),
        "probabilities": [round(p * 100, 2) for p in probabilities],
        "top3": top3,
        "preview": preview_url,
        "mode_used": mode
    })

if __name__ == "__main__":
    print("Starting Flask prediction server on http://127.0.0.1:5000...")
    app.run(host="127.0.0.1", port=5000, debug=False)
