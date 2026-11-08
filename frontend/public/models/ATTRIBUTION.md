# 3D tooth model

## Shipped model (`tooth.glb`)
- **Title:** Mandibular Third Molar
- **Author:** University of Dundee, School of Dentistry (https://sketchfab.com/DundeeDental)
- **Source:** https://sketchfab.com/3d-models/mandibular-third-molar-561bb06b3b084b84978163906de1c2b5
- **License:** CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/) — the home page hero shows the credit with a link.
- **Changes made:** textures resized from 4096² PNG to 2048² WebP, geometry quantized (KHR_mesh_quantization); mesh unchanged (51,216 triangles). 4.2 MB → 1.2 MB.

## Replacing the model (no code changes)
1. Save a GLB you are allowed to use as `frontend/public/models/tooth.glb`.
2. If it needs credit, set `NEXT_PUBLIC_TOOTH_MODEL_CREDIT` (text) and `NEXT_PUBLIC_TOOTH_MODEL_URL` (link) in the frontend env.
3. Rebuild the frontend. The viewer centres and frames any model; textured models keep their own textures.
