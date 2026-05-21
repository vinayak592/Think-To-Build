# Think-To-Build Deployment Guide

This guide explains how to deploy the **Node.js Backend** and the **Python CLIP Similarity Service** to cloud platforms like **Railway** and **Heroku**.

---

## 🚀 Resolving the 502 Bad Gateway

### The Cause
Previously, the Node.js server was configured to start listening on its `PORT` only **after** successfully establishing a connection to MongoDB:
```javascript
// Old logic (caused 502 Bad Gateway)
mongoose.connect(MONGODB_URI).then(() => {
  server.listen(PORT, ...);
});
```
On cloud platforms (Railway, Heroku), if the database connection was slow or the `MONGODB_URI` environment variable was missing/incorrect, the server never started listening. The platform's reverse proxy detected that nothing bound to the port and returned a **502 Bad Gateway** error.

### The Fix
We have modified `backend/server.js` to **bind to the `PORT` immediately** and handle the MongoDB connection asynchronously in the background. The server now boots up instantly:
- Static pages (like `GET /` and `GET /portals`) will load out-of-the-box.
- If there is an issue with your database connection, it will log the error to the console instead of crashing/blocking the server.

---

## 🛠️ Deploying the Node.js Backend

You can deploy the root repository directly to Heroku or Railway.

### Environment Variables
You must set the following environment variables in your hosting provider's dashboard:

| Variable | Description | Example / Fallback |
| :--- | :--- | :--- |
| `PORT` | Auto-provided by Railway/Heroku | *Don't set manually* |
| `MONGODB_URI` | Connection string to MongoDB (e.g., MongoDB Atlas) | `mongodb+srv://user:pass@cluster.mongodb.net/db` |
| `JWT_SECRET` | Secret key for signing tokens | `your_secure_jwt_secret` |
| `CLIP_SERVICE_URL` | URL of the deployed Python CLIP microservice | `https://clip-service.up.railway.app` |
| `ADMIN_EMAIL` | Credentials for admin dashboard | `admin456@gmail.com` |
| `ADMIN_PASSWORD` | Credentials for admin dashboard | `admin_password` |
| `JUDGE_EMAIL` | Credentials for judge portal | `judges456@gmail.com` |
| `JUDGE_PASSWORD` | Credentials for judge portal | `judge_password` |

### Persistent Image Uploads (Cloudinary)
On cloud platforms like Heroku/Railway, the local filesystem is **ephemeral** (any files uploaded locally to `/uploads` are wiped whenever the application restarts or goes to sleep).

To prevent images from disappearing, configure Cloudinary for persistent cloud storage. Add these variables to your environment:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

When these variables are detected, the backend will automatically upload files to Cloudinary, save the persistent Cloudinary URL in the database, and delete the temporary local file.

---

## 🐍 Deploying the Python CLIP Service

Because the CLIP service uses **PyTorch** and **Transformers**, it is a heavy machine learning microservice that can consume up to 1GB of RAM. We recommend deploying it as a **separate service** so it does not starve the main Node.js application of resources.

### Deploying on Railway
1. Create a **New Service** on Railway.
2. Select **GitHub Repo** and choose this repository.
3. In the service settings, set the **Root Directory** to `/clip_service`.
4. Railway will automatically detect the Python environment and build it using `clip_service/requirements.txt`.
5. Once deployed, copy the provided domain URL (e.g., `https://your-clip-service.up.railway.app`) and paste it as the `CLIP_SERVICE_URL` environment variable in your Node.js backend.

### Deploying on Heroku
1. Create a new Heroku app.
2. Deploy the `clip_service` subdirectory (e.g., using the `heroku-buildpack-monorepo` buildpack or by pushing the subdirectory using git).
3. The included `clip_service/Procfile` will automatically launch the service using `uvicorn`.

---

## 📂 Configuration Files Summary

The following configuration files have been pre-configured for your deployment:

- **Root `Procfile`**: Tells Heroku/Railway to start the Node.js server.
- **Root `package.json`**: Script definitions updated to build dependencies using `--prefix backend` without recursive conflicts, and all invalid dependencies cleaned up.
- **`clip_service/Procfile`**: Configured to run the FastAPI app in production.
- **`clip_service/app.py`**: Updated to dynamically bind to `$PORT` and `$HOST` (binding to `0.0.0.0` in cloud environments).
- **`backend/routes/api.js`**: Updated to restore the admin target image from the database if deleted locally, and support Cloudinary uploads.
