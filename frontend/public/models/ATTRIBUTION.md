# 3D Dental Model Verification & Attribution

## Candidate Sources Reviewed

### 1. Preferred Source
- **Title**: Mandibular Third Molar
- **Author**: University of Dundee, School of Dentistry
- **Source URL**: https://sketchfab.com/3d-models/mandibular-third-molar-561bb06b3b084b84978163906de1c2b5
- **License**: Creative Commons Attribution-NonCommercial (CC BY-NC 4.0) / Educational
- **Access Status**: Sketchfab Data API v3 requires user authentication via OAuth token (`Authorization: Bearer <API_TOKEN>`) to programmatically download glTF/GLB archives. Direct unauthenticated automated download is unavailable in this environment.

### 2. Alternative Source
- **Title**: Molar Tooth
- **Author**: Vikrama Raghuraman
- **Source URL**: https://sketchfab.com/3d-models/molar-tooth-54376b4e2c3b4091aedaa12d94e15076
- **License**: Creative Commons Attribution (CC BY 4.0)
- **Access Status**: Requires authenticated Sketchfab user account session for zip/archive generation.

## Active Production Asset (`tooth.glb`)
- **File**: `frontend/public/models/tooth.glb` (808 KB)
- **Format**: Binary glTF 2.0
- **Geometry**: Complete anatomical molar with intact coronal cusps, enamel-cementum junction (cervical line), bifurcated anatomical roots, and apical foramina.
- **Modifications Applied**:
  - Centered pivot point to exact bounding-box geometric centroid `(0, 0, 0)` so rotations rotate symmetrically around tooth mass center.
  - Three.js runtime MeshPhysicalMaterial shader applied with:
    - Warm natural ivory coloration (`#FCFBF7`)
    - Surface micro-roughness `0.22`
    - Specular clearcoat `0.6` with roughness `0.18` simulating moist oral enamel sheen
    - Index of refraction `ior = 1.62` matching biological human hydroxyapatite tooth enamel
    - Metalness `0.0` (purely non-metallic biological tissue)
  - Camera positioned automatically using bounding sphere radius and viewport aspect ratio `Math.max(distV, distH) * 1.35` to guarantee zero cropping of roots or crown across all desktop, tablet, and mobile viewports.
