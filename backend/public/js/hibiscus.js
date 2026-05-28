/**
 * hibiscus.js
 * 
 * NOTE: The hibiscus flower scoring feature is fully integrated into team.js
 * and the backend API (routes/api.js → getHibiscusScore → Flask /predict).
 * 
 * Flow:
 *   Team uploads images on dashboard.html
 *   → team.js calls POST /api/upload-images
 *   → api.js calls Flask at http://127.0.0.1:5000/predict for each image
 *   → Each image gets an individual hibiscus confidence score (0-100%)
 *   → round1_score = Math.max of all image scores (best of 3)
 *   → team.js renders per-image scores + best score in the UI
 * 
 * This file is intentionally kept as a reference only.
 * Do not add event listeners here — team.js owns the upload flow.
 */
