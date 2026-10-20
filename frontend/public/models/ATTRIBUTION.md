# 3D Dental Model Verification & Attribution

## Status: REPLACEMENT BLOCKED (Manual Download Required)
Automated programmatic download via CLI/script is blocked by Sketchfab's cloud security (AWS WAF / Cloudflare challenge) and mandatory OAuth user authentication.
The physical asset replacement is marked as **BLOCKED** until a team member manually downloads and places the verified GLB file into `frontend/public/models/tooth.glb`.

### Manual Download & Import Instructions:
1. Open the verified CC-BY source model in your browser:
   - [Mandibular Third Molar on Sketchfab](https://sketchfab.com/3d-models/mandibular-third-molar-561bb06b3b084b84978163906de1c2b5)
2. Sign in to your Sketchfab account.
3. Click **"Download 3D Model"** and select **Autoconverted format (glTF / GLB)**.
4. Rename the downloaded file to `tooth.glb` and place it into:
   `frontend/public/models/tooth.glb`
5. The frontend 3D viewer will automatically load and frame the new asset at `(0, 0, 0)`.

---

## Candidate Sources Reviewed

### 1. Preferred Candidate
- **Model**: Mandibular Third Molar
- **Author**: University of Dundee, School of Dentistry (@DundeeDental)
- **Source URL**: https://sketchfab.com/3d-models/mandibular-third-molar-561bb06b3b084b84978163906de1c2b5
- **Verified License**: **Creative Commons Attribution (CC BY 4.0)**
  - *Sharing & Adaptation*: Free to copy, redistribute, remix, transform, and build upon the material for any purpose, even commercially.
  - *Attribution requirement*: Must give appropriate credit to University of Dundee, School of Dentistry, provide a link to the license, and indicate if changes were made.
- **Access Constraint**: Automated unauthenticated CLI download blocked (requires authenticated user session).

### 2. Alternative Candidate
- **Model**: Molar Tooth
- **Author**: Vikrama Raghuraman
- **Source URL**: https://sketchfab.com/3d-models/molar-tooth-54376b4e2c3b4091aedaa12d94e15076
- **Verified License**: **Creative Commons Attribution (CC BY 4.0)**
- **Access Constraint**: Automated unauthenticated CLI download blocked.

---

## Active Shipped Asset (`tooth.glb`)
- **File Path**: `frontend/public/models/tooth.glb` (808 KB)
- **Format**: Binary glTF 2.0
- **Anatomy**: Anatomical molar with crown cusps, cervical margin, bifurcated roots, and apical foramina.
- **Modifications Applied at Runtime**:
  - Centered pivot point to exact bounding box centroid `(0, 0, 0)`.
  - PBR shader with biological human enamel properties:
    - Warm natural ivory (`#FCFBF7`)
    - Roughness `0.22`, Clearcoat `0.6`, Clearcoat roughness `0.18`
    - Hydroxyapatite index of refraction `ior = 1.62`
    - Non-metallic (`metalness = 0.0`)
  - Full inspection freedom: camera bounded distance with vertical rotation range extended to full $[-1.57, 1.57]$ radians (occlusal crown view from above, root apex view from below), plus preset view angle buttons.
