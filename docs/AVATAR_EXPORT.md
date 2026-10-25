# Export a free (CC0) base body for the Design Lobby

**Goal:** one file, `uniqo-body.glb`, holding a **clothes-free, neutral-pose female body** with skin, eyes,
eyebrows and eyelashes (hair optional). The lobby then measures this body and fits every garment to it
automatically.

Time needed: about 30–45 minutes the first time.

> **Shortcut (what the site ships with):** `tools/make_avatar.py` does all of this headless.
> With Blender 4.2+ installed, run once `blender --online-mode -c extension install mpfb --enable`, then
> `blender --background --python tools/make_avatar.py`. It writes `public/assets/avatar/uniqo-body.glb`
> (CC0, ~0.6 MB, arms 22° out, softened bust, untextured — the lobby tints the skin and adds hair).
> Change the `macros` or `ARM_ANGLE` at the top of the script to reshape her. The manual steps below
> are for a custom body with its own skin, eyes and lashes.

---

## 1. Install the tools (free)

1. **Blender 4.2 or newer** from **blender.org/download**.
2. Open Blender → **Edit → Preferences → Get Extensions**, search **MPFB**, and click **Install**.
   (MPFB is the MakeHuman plugin for Blender.)
3. MPFB needs its asset pack (body parts, skins, eyes):
   - Download **"MakeHuman system assets"** from the MakeHuman community site
     (`static.makehumancommunity.org` → *assets* → the `makehuman_system_assets` zip). This pack is **CC0**.
   - In Blender, press **N** in the 3D view → **MPFB** tab → **Apps and assets → Load pack from zip**,
     and pick the zip.

> **Licence check:** the MakeHuman *system* assets are CC0 (free for commercial use, no credit required).
> If you add *community* assets (extra hair, skins), check each one's licence. Prefer CC0, and tell me
> about any CC-BY items so the site can credit them.

## 2. Create the body

In the **MPFB** tab → **New human → From scratch**:

| Setting | Value | Why |
|---|---|---|
| Gender | **Female (100%)** | |
| Age | about **25 years** | |
| Muscle | **50%** | |
| Weight | **45–50%** | the soft hourglass from your reference sheet |
| Height | about **168–170 cm** | |
| Proportions | **ideal / 100%** | |
| Scale | **Meter** | the site works in metres |
| **Delete helpers** | **ON** (if the option is shown) | removes invisible helper geometry |

Click **Create human**.

Then in **Apply assets**:
- **Skin:** a "young female" skin with a texture. Any tone is fine; the lobby tints it to the customer's
  chosen skin tone.
- **Eyes:** a basic eye set (otherwise the eye sockets look empty).
- **Eyebrows + Eyelashes:** yes.
- **Hair:** optional. If you add one, choose a long style. If you skip it, the lobby keeps its own wavy half-up hair.
- **Clothes:** **none**. This matters, because garments come from the lobby.

## 3. Pose: arms slightly away from the body

The lobby measures the body in horizontal slices, so the arms must not touch the torso.

1. **Rigging → Add standard rig** (the default skeleton).
2. Select the rig, switch to **Pose Mode**, and rotate both **upper-arm** bones down until the arms hang
   about **20–25° away from the sides** (a relaxed "mannequin" pose, not a T-pose).
3. Keep the **legs straight**, with feet about **10 cm apart**, facing forward.
4. Bake the pose: select the **body**, go to **Modifier properties**, and **Apply** the *Armature* modifier.
   Do the same for the eyes, eyebrows, eyelashes and hair if they have one.
   Then **delete the rig**.

## 4. Position check (before exporting)

- **Front view (Numpad 1):** the body faces **you**, which is Blender's −Y direction.
- **Feet on the floor:** the soles sit at **Z = 0**, centred on X = 0, Y = 0.
- **Height:** select the body and press **N → Item**; dimension **Z ≈ 1.68–1.70 m**.
- **Ctrl+A → All Transforms** on every object, so rotation and scale are baked in.

## 5. Export

Select the body, eyes, eyebrows, eyelashes (and hair). Then **File → Export → glTF 2.0** with:

| Option | Setting |
|---|---|
| Format | **glTF Binary (.glb)** |
| Include → Limit to | **Selected Objects** |
| Transform | **+Y Up** ✓ |
| Data → Mesh | **Apply Modifiers** ✓, **UVs** ✓, **Normals** ✓ |
| Data → Material | **Export** |
| Images | **JPEG** (quality ~85) |
| Compression (Draco) | **OFF** |
| Animation / Shape keys / Skinning | **OFF** |

Save it as **`D:\UniQO\public\assets\avatar\uniqo-body.glb`**.

**Size target:** under **8 MB**. If it's bigger, set the skin texture to **2048 px** (or 1024 px) before
exporting.

---

## Checklist before telling me "done"

- [ ] No clothes on the body
- [ ] Arms about 20–25° away from the torso; legs straight, feet slightly apart
- [ ] Faces front (Blender −Y); feet at Z = 0; about 1.69 m tall; transforms applied
- [ ] Skin texture, eyes, eyebrows and eyelashes included
- [ ] `.glb`, Draco **off**, under 8 MB, saved to `public\assets\avatar\uniqo-body.glb`
